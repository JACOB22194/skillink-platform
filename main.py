import asyncio, atexit, os, re, json, time, joblib, uuid, numpy as np, scipy.sparse as sp
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from parse_github import parse_github
from ai_match_endpoint import router as match_router
from routers.launchpad_router import router as launchpad_router
from routers.skill_growth_router import router as skill_growth_router
from routers.retrain_router import router as retrain_router, set_registry as _set_retrain_registry
from routers.pricing_router import router as pricing_router

# ML-02: hot-swap registry for retrained models
_MODELS: dict = {}

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
    model_variant:    Optional[str] = None   # ML-06: "control" | "treatment" | None

class GitHubRequest(BaseModel):
    url: str = Field(..., example="https://github.com/torvalds")

class OptimizeBioRequest(BaseModel):
    bio: str = Field("", example="I am a developer.")
    skills: list[str] = Field([], example=["Python", "React"])

class OptimizeBioResponse(BaseModel):
    optimized_bio: str

class ScoreRequest(BaseModel):
    project_title: str
    project_description: str
    required_skills: list[str]
    budget: float
    bid_amount: float
    cover_letter: str
    freelancer_skills: list[str]
    freelancer_bio: str
    success_score: float

class ScoreResponse(BaseModel):
    score: float
    reasoning: str


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


def _predict_retrained(text: str, top_k: int) -> dict | None:
    """Use retrained models when available (ML-02 hot-swap path)."""
    tfidf   = _MODELS.get("retrained_tfidf")
    lr_sub  = _MODELS.get("retrained_lr_sub")
    svc_sub = _MODELS.get("retrained_svc_sub")
    lr_cat  = _MODELS.get("retrained_lr_cat")
    le_sub  = _MODELS.get("retrained_le_sub")
    le_cat  = _MODELS.get("retrained_le_cat")
    if not all([tfidf, lr_sub, svc_sub, lr_cat, le_sub, le_cat]):
        return None
    X         = tfidf.transform([text])
    p_sub     = (lr_sub.predict_proba(X)[0] + svc_sub.predict_proba(X)[0]) / 2
    class_ids = np.argsort(p_sub)[::-1]
    top_id    = class_ids[0]
    p_cat     = lr_cat.predict_proba(X)[0]
    return {
        "sub_category":     le_sub.classes_[top_id],
        "category":         le_cat.classes_[np.argmax(p_cat)],
        "confidence":       round(float(p_sub[top_id]) * 100, 1),
        "top_alternatives": [
            {"sub_category": le_sub.classes_[i], "confidence": round(float(p_sub[i]) * 100, 1)}
            for i in class_ids[1:top_k + 1] if i != top_id
        ],
    }


def _predict(title: str, description: str,
             category_hint: str = None, top_k: int = 5,
             variant: str = "auto") -> dict:
    t0   = time.perf_counter()
    text = _clean(title) + " " + _clean(description)

    # ML-06: A/B routing — "control" forces original; "treatment"/"auto" try retrained first
    if variant != "control":
        retrained = _predict_retrained(text, top_k)
        if retrained:
            retrained["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            return retrained

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

_INFERENCE_TIMEOUT = 5.0  # seconds — ML-04: server-side latency limit


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    if not req.title.strip() and not req.description.strip():
        raise HTTPException(status_code=422, detail="title or description must be non-empty")
    # ML-06: A/B routing
    from services.ab_service import route_request
    rid     = str(uuid.uuid4())
    variant = route_request(rid)
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_predict, req.title, req.description, req.category_hint, req.top_k, variant),
            timeout=_INFERENCE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Inference timeout: exceeded 5 s limit")
    result["model_variant"] = variant
    return PredictResponse(**result)

@app.post("/classify")
async def classify(req: PredictRequest):
    """Alias for /predict — used by the backend recommend_router."""
    if not req.title.strip() and not req.description.strip():
        raise HTTPException(status_code=422, detail="title or description must be non-empty")
    # ML-06: A/B routing
    from services.ab_service import route_request
    rid     = str(uuid.uuid4())
    variant = route_request(rid)
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_predict, req.title, req.description, req.category_hint, req.top_k, variant),
            timeout=_INFERENCE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Inference timeout: exceeded 5 s limit")
    result["model_variant"] = variant
    return PredictResponse(**result)

@app.post("/predict/batch")
def predict_batch(jobs: list[PredictRequest]):
    if len(jobs) > 100:
        raise HTTPException(status_code=422, detail="max 100 jobs per batch")
    return [_predict(j.title, j.description, j.category_hint, j.top_k) for j in jobs]


# ── Bio Optimizer ────────────────────────────────────────────────────────────

_GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
]

@app.post("/optimize-bio", response_model=OptimizeBioResponse)
def optimize_bio(req: OptimizeBioRequest):
    import logging
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
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
        client = genai.Client(api_key=api_key)
        for model in _GEMINI_MODELS:
            try:
                response = client.models.generate_content(model=model, contents=prompt)
                return {"optimized_bio": response.text.strip()}
            except Exception as e:
                logging.warning("optimize-bio: model %s failed: %s", model, e)
    # Graceful fallback: return the original bio unchanged
    return {"optimized_bio": req.bio or ""}


# ── GitHub Parser ─────────────────────────────────────────────────────────────

@app.post("/parse-github")
def parse_github_endpoint(req: GitHubRequest):
    try:
        return parse_github(req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Proposal Scorer ───────────────────────────────────────────────────────────

@app.post("/score", response_model=ScoreResponse)
async def score_proposal_endpoint(req: ScoreRequest):
    import logging
    import asyncio
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        from google import genai
        prompt = (
            "You are an expert AI proposal reviewer for a freelancing platform.\n"
            "Evaluate the relevance and quality of this freelancer's proposal draft for a client's project.\n\n"
            f"Project Title: {req.project_title}\n"
            f"Project Description: {req.project_description}\n"
            f"Required Skills: {', '.join(req.required_skills)}\n"
            f"Project Budget: ${req.budget}\n\n"
            f"Freelancer Cover Letter: {req.cover_letter}\n"
            f"Freelancer Bio: {req.freelancer_bio}\n"
            f"Freelancer Skills: {', '.join(req.freelancer_skills)}\n"
            f"Freelancer Bid Amount: ${req.bid_amount}\n"
            f"Freelancer Platform Success Score: {req.success_score}\n\n"
            "Provide:\n"
            "1. A score between 0.0 and 1.0 representing how relevant, qualified, and well-aligned the proposal is.\n"
            "2. A concise 1-2 sentence explanation of your scoring reasoning.\n\n"
            "Return your response in strict JSON format with exactly two keys: 'score' and 'reasoning'."
        )
        t_start = time.perf_counter()
        client = genai.Client(api_key=api_key)
        for model in _GEMINI_MODELS:
            if time.perf_counter() - t_start > 5.5:
                logging.warning("score-proposal: spent too much time on Gemini calls, skipping to local fallback.")
                break
            try:
                # Wrap the async generate_content call with a 4.0 second timeout!
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(model=model, contents=prompt),
                    timeout=4.0
                )
                raw = re.sub(r'^```json\s*|^```\s*|```$', '', response.text.strip(), flags=re.MULTILINE).strip()
                res_data = json.loads(raw)
                score_val = float(res_data['score'])
                reasoning_val = str(res_data['reasoning'])
                return {'score': score_val, 'reasoning': reasoning_val}
            except asyncio.TimeoutError:
                logging.warning("score-proposal: model %s call timed out after 4.0s", model)
            except Exception as e:
                logging.warning("score-proposal: model %s failed: %s", model, e)

    # ── Local Fallback ──────────────────────────────────────────────────────────
    from recommender import _ENCODER, _SEMANTIC
    text_job = f"{req.project_title} {req.project_description}"
    text_free = f"{req.cover_letter} {req.freelancer_bio}"
    semantic_score = 0.5
    if _SEMANTIC and _ENCODER is not None:
        try:
            vecs = await asyncio.to_thread(_ENCODER.encode, [text_job, text_free], normalize_embeddings=True)
            semantic_score = float(vecs[0] @ vecs[1])
            semantic_score = max(0.0, min(1.0, semantic_score))
        except Exception:
            pass
    else:
        try:
            m = TFIDF.transform([text_job, text_free])
            semantic_score = float((m[0] @ m[1].T).toarray()[0][0])
            semantic_score = max(0.0, min(1.0, semantic_score))
        except Exception:
            pass

    req_skills_set = {s.lower() for s in req.required_skills}
    free_skills_set = {s.lower() for s in req.freelancer_skills}
    if req_skills_set:
        overlap = req_skills_set & free_skills_set
        skill_score = len(overlap) / len(req_skills_set)
    else:
        skill_score = 1.0

    if req.budget > 0:
        diff = abs(req.bid_amount - req.budget) / req.budget
        bid_score = max(0.0, min(1.0, 1.0 - diff))
    else:
        bid_score = 1.0

    score = round(0.50 * semantic_score + 0.35 * skill_score + 0.15 * bid_score, 4)
    reasoning = (
        f"AI service unavailable. Estimated score based on skill overlap ({round(skill_score * 100)}%), "
        f"semantic alignment ({round(semantic_score * 100)}%), and bid/budget fit ({round(bid_score * 100)}%)."
    )
    return {"score": score, "reasoning": reasoning}



app.include_router(match_router)         # POST /match
app.include_router(launchpad_router)     # POST /launchpad/recommend
app.include_router(skill_growth_router)  # POST /skill-growth/analyze
app.include_router(retrain_router)       # ML-02: POST /retrain/trigger, GET /retrain/status|history
app.include_router(pricing_router)

# Wire shared registry so retrain_router can hot-swap _MODELS
_set_retrain_registry(_MODELS)

# ML-02: nightly APScheduler — retrains at 02:00 every night
try:
    from apscheduler.schedulers.background import BackgroundScheduler

    def _nightly_retrain():
        from services.retrain_service import run_scheduled_retrain
        run_scheduled_retrain(_MODELS)

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(_nightly_retrain, "cron", hour=2, minute=0, id="nightly_retrain")
    _scheduler.start()
    atexit.register(_scheduler.shutdown)
except ImportError:
    pass  # apscheduler not installed yet — manual trigger still works


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)