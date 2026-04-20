
import re, json, time, joblib, numpy as np, scipy.sparse as sp
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

# ── Load model artefacts once at startup ─────────────────────────────────────
MODEL_DIR = Path("./skillink_model")
LR        = joblib.load(MODEL_DIR / "lr_model.joblib")
TFIDF     = joblib.load(MODEL_DIR / "tfidf.joblib")
OHE       = joblib.load(MODEL_DIR / "ohe.joblib")
LE_CAT    = joblib.load(MODEL_DIR / "le_cat.joblib")
LE_SUB    = joblib.load(MODEL_DIR / "le_sub.joblib")

with open(MODEL_DIR / "cat_to_subs.json") as f:
    CAT_TO_SUBS = json.load(f)
with open(MODEL_DIR / "filler_pattern.txt") as f:
    FILLER_RE = re.compile(f.read(), flags=re.IGNORECASE)
with open(MODEL_DIR / "metadata.json") as f:
    META = json.load(f)

app = FastAPI(
    title       = "Skillink Classifier API",
    description = "Real-time freelance job sub-category prediction",
    version     = "1.0.0",
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
                                          description="Optional: known parent category for hierarchical filtering")
    top_k:          int  = Field(5, ge=1, le=20,
                                 description="Number of alternative predictions to return")

class Alternative(BaseModel):
    sub_category: str
    confidence:   float

class PredictResponse(BaseModel):
    sub_category:    str    # Primary prediction -- e.g. "Logo Design"
    category:        str    # Parent category  -- e.g. "Design"
    confidence:      float  # Confidence % for top prediction
    latency_ms:      float  # Server-side inference latency
    top_alternatives: list[Alternative]


# ── Inference helper ──────────────────────────────────────────────────────────
def _clean(text: str) -> str:
    return re.sub(r"\s{2,}", " ", FILLER_RE.sub(" ", str(text))).strip()

def _predict(title: str, description: str,
             category_hint: str = None, top_k: int = 5) -> dict:
    t0 = time.perf_counter()

    text   = _clean(title) + " " + _clean(description)
    X_text = TFIDF.transform([text])

    cat_enc = (LE_CAT.transform([category_hint])[0]
               if category_hint and category_hint in LE_CAT.classes_
               else 0)
    cat_ohe = OHE.transform(np.array([[cat_enc]]))
    X       = sp.hstack([X_text, cat_ohe * 3])

    proba     = LR.predict_proba(X)[0]
    class_ids = np.argsort(proba)[::-1]

    if category_hint and category_hint in CAT_TO_SUBS:
        valid = set(CAT_TO_SUBS[category_hint])
        top_id = next((i for i in class_ids if LE_SUB.classes_[i] in valid),
                      class_ids[0])
    else:
        top_id = class_ids[0]

    pred_sub = LE_SUB.classes_[top_id]
    pred_cat = next((c for c, s in CAT_TO_SUBS.items() if pred_sub in s), "Unknown")

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
    return {"status": "ok", "model": META["model_type"],
            "sub_categories": META["num_sub_categories"],
            "f1_macro": META["test_f1_macro"]}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/categories")
def categories():
    # Return all valid sub-category and category names.
    return {
        "sub_categories": sorted(LE_SUB.classes_.tolist()),
        "categories":     sorted(LE_CAT.classes_.tolist()),
        "hierarchy":      CAT_TO_SUBS,
    }

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    # Predict sub-category for a freelance job posting.
    # Returns primary label, parent category, confidence, top alternatives.
    # Typical latency under 1ms server-side.
    
    if not req.title.strip() and not req.description.strip():
        raise HTTPException(status_code=422, detail="title or description must be non-empty")

    result = _predict(req.title, req.description, req.category_hint, req.top_k)
    return PredictResponse(**result)

@app.post("/predict/batch")
def predict_batch(jobs: list[PredictRequest]):
    # Batch predict -- up to 100 jobs in one call.
    if len(jobs) > 100:
        raise HTTPException(status_code=422, detail="max 100 jobs per batch")
    return [_predict(j.title, j.description, j.category_hint, j.top_k) for j in jobs]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
