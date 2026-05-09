import os, re, json, time, joblib, numpy as np, scipy.sparse as sp
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from parse_github import parse_github
from ai_match_endpoint import router as match_router

# ── Load model artefacts once at startup ─────────────────────────────────────
MODEL_DIR = Path("./skillink_model")

LR_SUB     = joblib.load(MODEL_DIR / "lr_sub.joblib")
LR_CAT     = joblib.load(MODEL_DIR / "lr_cat.joblib")
SVC_SUB    = joblib.load(MODEL_DIR / "svc_sub.joblib")
TFIDF      = joblib.load(MODEL_DIR / "tfidf.joblib")
OHE        = joblib.load(MODEL_DIR / "ohe.joblib")
LE_CAT_OHE = joblib.load(MODEL_DIR / "le_cat_ohe.joblib")
LE_CAT     = joblib.load(MODEL_DIR / "le_cat.joblib")
LE_SUB     = joblib.load(MODEL_DIR / "le_sub.joblib")

with open(MODEL_DIR / "sub_to_cat.json") as f:
    SUB_TO_CAT = json.load(f)
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
    title       = "Skillink AI API",
    description = "Job classification + GitHub profile parser",
    version     = "3.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


# ── Request / Response models ─────────────────────────────────────────────────

class PredictRequest(BaseModel):
    title:         str           = Field(..., example="Logo Design for Tech Startup")
    description:   str           = Field(..., example="I need a clean modern logo.")
    category_hint: Optional[str] = Field(None, example="Design")
    top_k:         int           = Field(5, ge=1, le=20)

class Alternative(BaseModel):
    sub_category: str
    confidence:   float

class PredictResponse(BaseModel):
    sub_category:     str
    category:         str
    confidence:       float
    latency_ms:       float
    top_alternatives: list[Alternative]

class GitHubRequest(BaseModel):
    url: str = Field(..., example="https://github.com/torvalds")

class OptimizeBioRequest(BaseModel):
    bio: str = Field("", example="I am a developer.")
    skills: list[str] = Field([], example=["Python", "React"])

class OptimizeBioResponse(BaseModel):
    optimized_bio: str


# ── Classifier helpers ────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    return re.sub(r"\s{2,}", " ", FILLER_RE.sub(" ", str(text))).strip()


def _build_features(text: str, category_hint: str = None) -> sp.spmatrix:
    X_text = TFIDF.transform([text])
    if not category_hint or category_hint not in LE_CAT_OHE.classes_:
        cat_pred = LR_CAT.predict(X_text)[0]
        category_hint = LE_CAT.inverse_transform([cat_pred])[0] if cat_pred < len(LE_CAT.classes_) else None
    cat_enc = (LE_CAT_OHE.transform([category_hint])[0]
               if category_hint and category_hint in LE_CAT_OHE.classes_ else 0)
    cat_ohe = OHE.transform(np.array([[cat_enc]]))
    return sp.hstack([X_text, cat_ohe * 3])


def _ensemble_predict(X: sp.spmatrix) -> np.ndarray:
    p1 = LR_SUB.predict_proba(X)[0]
    p2 = SVC_SUB.predict_proba(X)[0]
    return (p1 + p2) / 2.0


def _predict(title: str, description: str,
             category_hint: str = None, top_k: int = 5) -> dict:
    t0 = time.perf_counter()
    text = _clean(title) + " " + _clean(description)
    X    = _build_features(text, category_hint)
    proba     = _ensemble_predict(X)
    class_ids = np.argsort(proba)[::-1]
    if category_hint and category_hint in CAT_TO_SUBS:
        valid  = set(CAT_TO_SUBS[category_hint])
        top_id = next((i for i in class_ids if LE_SUB.classes_[i] in valid), class_ids[0])
    else:
        top_id = class_ids[0]
    pred_sub = LE_SUB.classes_[top_id]
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
        "status":             "ok",
        "model_version":      "3.0.0",
        "architecture":       "Ensemble LR×2 + LinearSVC",
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
    return {
        "sub_categories": sorted(LE_SUB.classes_.tolist()),
        "categories":     sorted(LE_CAT.classes_.tolist()),
        "hierarchy":      CAT_TO_SUBS,
        "sub_to_cat":     SUB_TO_CAT,
    }

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if not req.title.strip() and not req.description.strip():
        raise HTTPException(status_code=422, detail="title or description must be non-empty")
    return PredictResponse(**_predict(req.title, req.description, req.category_hint, req.top_k))

@app.post("/classify")
def classify(req: PredictRequest):
    """Alias for /predict — used by the backend recommend_router."""
    if not req.title.strip() and not req.description.strip():
        raise HTTPException(status_code=422, detail="title or description must be non-empty")
    return PredictResponse(**_predict(req.title, req.description, req.category_hint, req.top_k))

@app.post("/predict/batch")
def predict_batch(jobs: list[PredictRequest]):
    if len(jobs) > 100:
        raise HTTPException(status_code=422, detail="max 100 jobs per batch")
    return [_predict(j.title, j.description, j.category_hint, j.top_k) for j in jobs]


# ── Bio Optimizer ────────────────────────────────────────────────────────────

@app.post("/optimize-bio", response_model=OptimizeBioResponse)
def optimize_bio(req: OptimizeBioRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")

    from google import genai
    skills_text = ", ".join(req.skills) if req.skills else "general freelancing"
    prompt = (
        "You are a professional profile writer for a freelance platform.\n"
        "Rewrite the bio below to be compelling and professional, weaving in the listed skills naturally.\n"
        "Keep it 2-4 sentences, first person, no buzzwords. Return ONLY the rewritten bio — no quotes, no explanation.\n\n"
        f"Current bio: {req.bio or 'No bio provided'}\n"
        f"Skills: {skills_text}\n\n"
        "Optimized bio:"
    )
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        return {"optimized_bio": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Gemini error: {e}")


# ── GitHub Parser ─────────────────────────────────────────────────────────────

@app.post("/parse-github")
def parse_github_endpoint(req: GitHubRequest):
    try:
        return parse_github(req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


app.include_router(match_router)            # POST /match


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
