
import re, json, time, joblib, numpy as np, scipy.sparse as sp
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

# ── Load model artefacts once at startup ─────────────────────────────────────
MODEL_DIR = Path("./skillink_model")

# Ensemble components: 2× Logistic Regression + 1× LinearSVC
LR_SUB    = joblib.load(MODEL_DIR / "lr_sub.joblib")       # LR for sub-category
LR_CAT    = joblib.load(MODEL_DIR / "lr_cat.joblib")        # LR for category (text-only, 8k features → generates OHE prior)
SVC_SUB   = joblib.load(MODEL_DIR / "svc_sub.joblib")       # LinearSVC for sub-category

# Feature transformers
TFIDF     = joblib.load(MODEL_DIR / "tfidf.joblib")         # TF-IDF vectorizer (8k features)
OHE       = joblib.load(MODEL_DIR / "ohe.joblib")           # OneHotEncoder for category prior
LE_CAT_OHE = joblib.load(MODEL_DIR / "le_cat_ohe.joblib")   # LabelEncoder for OHE category input
LE_CAT    = joblib.load(MODEL_DIR / "le_cat.joblib")         # LabelEncoder for category names
LE_SUB    = joblib.load(MODEL_DIR / "le_sub.joblib")         # LabelEncoder for sub-category names

# Lookup tables & metadata
with open(MODEL_DIR / "sub_to_cat.json") as f:
    SUB_TO_CAT = json.load(f)                                # deterministic sub → category lookup
with open(MODEL_DIR / "cat_to_subs.json") as f:
    CAT_TO_SUBS = json.load(f)
with open(MODEL_DIR / "cat_labels.json") as f:
    CAT_LABELS = json.load(f)
with open(MODEL_DIR / "sub_labels.json") as f:
    SUB_LABELS = json.load(f)
with open(MODEL_DIR / "filler_pattern.txt") as f:
    FILLER_RE = re.compile(f.read(), flags=re.IGNORECASE)
with open(MODEL_DIR / "metadata.json") as f:
    META = json.load(f)

app = FastAPI(
    title       = "Skillink Classifier API",
    description = "Real-time freelance job sub-category prediction (Ensemble LR×2 + LinearSVC)",
    version     = "2.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


# ── Request / Response models ─────────────────────────────────────────────────
class PredictRequest(BaseModel):
    title:          str  = Field(..., example="Logo Design for Tech Startup",
                                 description="Job title -- short, dense signal")
    description:    str  = Field(..., example="I need a clean modern logo for my SaaS product.",
                                 description="Full job description")
    category_hint:  Optional[str] = Field(None, example="Design",
                                          description="Optional: known parent category used as structural prior (OHE input)")
    top_k:          int  = Field(5, ge=1, le=20,
                                 description="Number of alternative predictions to return")

class Alternative(BaseModel):
    sub_category: str
    confidence:   float

class PredictResponse(BaseModel):
    sub_category:    str    # PRIMARY OUTPUT -- e.g. "Logo Design"
    category:        str    # SECONDARY OUTPUT -- deterministic lookup from sub_to_cat
    confidence:      float  # Confidence % for top prediction
    latency_ms:      float  # Server-side inference latency
    top_alternatives: list[Alternative]


# ── Inference helper ──────────────────────────────────────────────────────────
def _clean(text: str) -> str:
    """Remove filler phrases and collapse whitespace."""
    return re.sub(r"\s{2,}", " ", FILLER_RE.sub(" ", str(text))).strip()


def _build_features(text: str, category_hint: str = None) -> sp.spmatrix:
    """
    Build feature matrix:  [TF-IDF 8k] + [Category OHE × 3]
    Category is used as a STRUCTURAL PRIOR, not a prediction target.
    """
    X_text = TFIDF.transform([text])

    # If no category_hint provided, use LR_CAT (text-only, 8000 features) to predict it
    if not category_hint or category_hint not in LE_CAT_OHE.classes_:
        cat_pred = LR_CAT.predict(X_text)[0]
        # LR_CAT predicts encoded category index → decode to name
        category_hint = LE_CAT.inverse_transform([cat_pred])[0] if cat_pred < len(LE_CAT.classes_) else None

    # Encode category via the OHE-specific label encoder
    cat_enc = (LE_CAT_OHE.transform([category_hint])[0]
               if category_hint and category_hint in LE_CAT_OHE.classes_
               else 0)
    cat_ohe = OHE.transform(np.array([[cat_enc]]))

    # Scale OHE by ×3 to give the structural prior appropriate weight
    return sp.hstack([X_text, cat_ohe * 3])


def _ensemble_predict(X: sp.spmatrix) -> np.ndarray:
    """
    Ensemble prediction: average probabilities from LR_SUB + SVC_SUB.
    
    LR_CAT is NOT part of this ensemble — it was trained on text-only (8000 features)
    to predict category. It's used upstream to generate the category structural prior.
    
    Pipeline:
      LR_SUB  → predict_proba       → p1  (8008 features → 43 sub-categories)
      SVC_SUB → decision_function    → softmax → p2  (8008 features → 43 sub-categories)
    
    Final = (p1 + p2) / 2
    """
    # LR sub-category probabilities
    p1 = LR_SUB.predict_proba(X)[0]

    # SVC probabilities (CalibratedClassifierCV wraps LinearSVC with predict_proba)
    p2 = SVC_SUB.predict_proba(X)[0]

    # Average ensemble
    return (p1 + p2) / 2.0


def _predict(title: str, description: str,
             category_hint: str = None, top_k: int = 5) -> dict:
    """
    Full inference pipeline:
      Input: Title + Description
        → [TF-IDF 8k] → LR_CAT → auto-predict category (structural prior)
        → [TF-IDF 8k] + [Category OHE × 3]
        → Ensemble LR_SUB + SVC_SUB
        → sub_category_probabilities [43]
        → argmax → Sub Category Name        (PRIMARY OUTPUT)
        → deterministic lookup table
        → Category Name                     (SECONDARY OUTPUT, 0.968 acc)
    """
    t0 = time.perf_counter()

    text = _clean(title) + " " + _clean(description)
    X    = _build_features(text, category_hint)

    # Ensemble prediction → probability vector over 43 sub-categories
    proba     = _ensemble_predict(X)
    class_ids = np.argsort(proba)[::-1]

    # If category_hint provided, prefer sub-categories within that category
    if category_hint and category_hint in CAT_TO_SUBS:
        valid = set(CAT_TO_SUBS[category_hint])
        top_id = next((i for i in class_ids if LE_SUB.classes_[i] in valid),
                      class_ids[0])
    else:
        top_id = class_ids[0]

    # PRIMARY OUTPUT: sub-category
    pred_sub = LE_SUB.classes_[top_id]

    # SECONDARY OUTPUT: category via deterministic lookup (always correct when sub is correct)
    pred_cat = SUB_TO_CAT.get(pred_sub, "Unknown")

    return {
        "sub_category":  pred_sub,
        "category":      pred_cat,
        "confidence":    round(float(proba[top_id]) * 100, 1),
        "latency_ms":    round((time.perf_counter() - t0) * 1000, 2),
        "top_alternatives": [
            {"sub_category": LE_SUB.classes_[i],
             "confidence":   round(float(proba[i]) * 100, 1)}
            for i in class_ids[1:top_k + 1] if i != top_id
        ],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "status":           "ok",
        "model_version":    "2.0.0",
        "architecture":     "Ensemble LR×2 + LinearSVC",
        "num_sub_categories": META["num_sub"],
        "num_categories":     META["num_cat"],
        "sub_test_acc":       META["sub_test_acc"],
        "sub_f1_macro":       META["sub_f1_macro"],
        "cat_test_acc":       META["cat_test_acc"],
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/categories")
def categories():
    """Return all valid sub-category and category names plus hierarchy."""
    return {
        "sub_categories": sorted(LE_SUB.classes_.tolist()),
        "categories":     sorted(LE_CAT.classes_.tolist()),
        "hierarchy":      CAT_TO_SUBS,
        "sub_to_cat":     SUB_TO_CAT,
    }

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    """
    Predict sub-category for a freelance job posting.
    
    Returns primary sub-category label, parent category (via deterministic lookup),
    confidence score, and top alternative predictions.
    Typical latency under 1ms server-side.
    """
    if not req.title.strip() and not req.description.strip():
        raise HTTPException(status_code=422, detail="title or description must be non-empty")

    result = _predict(req.title, req.description, req.category_hint, req.top_k)
    return PredictResponse(**result)

@app.post("/predict/batch")
def predict_batch(jobs: list[PredictRequest]):
    """Batch predict -- up to 100 jobs in one call."""
    if len(jobs) > 100:
        raise HTTPException(status_code=422, detail="max 100 jobs per batch")
    return [_predict(j.title, j.description, j.category_hint, j.top_k) for j in jobs]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
