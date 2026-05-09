"""
recommend_router.py  (FastAPI backend at :8000)
────────────────────────────────────────────────
Exposes two endpoints:

  POST /recommend/job/{job_id}
    → rank all eligible freelancers for an existing project
    → stores results in recommendations table for caching

  POST /recommend/preview
    → rank freelancers for a job-in-progress (not yet saved)
    → used during project creation flow (show matches before posting)

Both endpoints:
  1. Call the classifier at :8001 to get sub_category + category
  2. Query the DB for freelancer candidates
  3. Call the recommender at :8001 to score them
  4. Return ranked list with match scores and explanations
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import httpx, json, os, time

from auth import require_client, require_freelancer, get_current_user
from db   import get_db
import models

router = APIRouter(prefix="/recommend", tags=["Recommendations"])

AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://ai:8000")


# ── Request / Response models ─────────────────────────────────────────────────

class PreviewRequest(BaseModel):
    title:       str
    description: str
    budget_min:  float = 0.0
    budget_max:  float = 0.0
    top_k:       int   = 10


class MatchedFreelancer(BaseModel):
    freelancer_id:     int
    name:              str
    professional_title:str
    github_url:        str
    hourly_rate:       float
    github_score:      int
    match_score:       float    # 0–1
    matched_skills:    list[str]
    explanation:       str
    # Score breakdown (visible in admin, hidden in client UI)
    text_score:        float
    skill_score:       float
    quality_score:     float
    activity_score:    float
    # Classifier provenance — which top-N prediction triggered this match
    classifier_weight: float    # probability: 1.0 = top-1, ~0.1 = top-3
    matched_on:        str      # sub-category name that matched


class RecommendResponse(BaseModel):
    job_id:       Optional[int]
    sub_category: str
    category:     str
    matches:      list[MatchedFreelancer]
    latency_ms:   float


class MatchedProject(BaseModel):
    project_id:     int
    title:          str
    description:    str
    budget:         float
    contract_type:  str
    match_score:    float
    matched_skills: list[str]
    text_score:     float
    skill_score:    float
    quality_score:  float


class FreelancerMatchResponse(BaseModel):
    matches:    list[MatchedProject]
    latency_ms: float


# ── Helpers ───────────────────────────────────────────────────────────────────

def _classify(title: str, description: str) -> dict:
    """Call the classifier microservice to get sub_category + category."""
    try:
        with httpx.Client(timeout=10) as client:
            r = client.post(
                f"{AI_SERVICE_URL}/classify",
                json={"title": title, "description": description},
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Classifier error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unreachable: {str(e)}")


def _load_candidates(db: Session) -> list[dict]:
    """
    Load all freelancers with their skills from DB.
    Returns plain dicts — no SQLAlchemy objects leave this function.
    Freelancers without a parsed GitHub profile use a fallback profile_text
    built from their bio, professional title, and skills so they still
    participate in text-similarity scoring.
    """
    freelancers = (
        db.query(models.Freelancer)
        .join(models.User, models.Freelancer.user_id == models.User.id)
        .filter(models.User.status == "active")
        .filter(
            # Include anyone with at least a title, bio, or skills
            (models.Freelancer.professional_title.isnot(None)) |
            (models.Freelancer.bio.isnot(None)) |
            (models.Freelancer.profile_text.isnot(None))
        )
        .all()
    )

    candidates = []
    for f in freelancers:
        skills = [fs.skill.name for fs in f.skills if fs.skill]
        stats  = json.loads(f.github_stats or "{}")

        # Use parsed GitHub text when available; fall back to bio + title + skills
        profile_text = f.profile_text or " ".join(filter(None, [
            f.professional_title,
            f.bio,
            " ".join(skills),
        ]))

        candidates.append({
            "freelancer_id":      f.freelancer_id,
            "user_id":            f.user_id,
            "name":               f.user.email if f.user else "",
            "professional_title": f.professional_title or "",
            "bio":                f.bio or "",
            "hourly_rate":        float(f.hourly_rate or 0),
            "success_score":      float(f.success_score or 0),
            "github_score":       int(f.github_score or 0),
            "github_url":         f.github_url or "",
            "skills":             skills,
            "top_languages":      json.loads(f.top_languages or "[]"),
            "sub_category_tags":  json.loads(f.sub_category_tags or "[]"),
            "profile_text":       profile_text,
            "github_stats":       stats,
        })

    return candidates


def _call_recommender(
    title:            str,
    description:      str,
    sub_category:     str,
    category:         str,
    candidates:       list[dict],
    budget_min:       float,
    budget_max:       float,
    top_k:            int,
    top3_predictions: list[list] = None,   # [[sub_cat, prob], ...]
) -> list[dict]:
    """Call the AI service recommender endpoint."""
    try:
        with httpx.Client(timeout=30) as client:
            r = client.post(
                f"{AI_SERVICE_URL}/match",
                json={
                    "title":             title,
                    "description":       description,
                    "sub_category":      sub_category,
                    "category":          category,
                    "budget_min":        budget_min,
                    "budget_max":        budget_max,
                    "candidates":        candidates,
                    "top_k":             top_k,
                    "top3_predictions":  top3_predictions,
                },
                timeout=30,
            )
            r.raise_for_status()
            return r.json()["matches"]
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Recommender error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unreachable: {str(e)}")


def _cache_results(
    db:           Session,
    project_id:   int,
    matches:      list[dict],
) -> None:
    """
    Store top matches in the recommendations table.
    Uses INSERT ... ON DUPLICATE KEY UPDATE so re-running is idempotent.
    """
    # Delete stale results first
    db.query(models.Recommendation).filter(
        models.Recommendation.project_id == project_id
    ).delete()

    for m in matches:
        db.add(models.Recommendation(
            project_id    = project_id,
            freelancer_id = m["freelancer_id"],
            match_score   = m["match_score"],
            text_score    = m["text_score"],
            skill_score   = m["skill_score"],
            quality_score = m["quality_score"],
            matched_skills= json.dumps(m["matched_skills"]),
        ))
    db.commit()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/job/{job_id}", response_model=RecommendResponse)
def recommend_for_job(
    job_id: int,
    top_k:  int      = Query(default=10, ge=1, le=50),
    me:     models.User = Depends(get_current_user),
    db:     Session     = Depends(get_db),
):
    """
    Rank freelancers for an existing project.
    Accessible by: the client who posted the job, or any admin.
    Results are cached in the recommendations table.
    """
    t0 = time.perf_counter()

    # ── Authorise ─────────────────────────────────────────────────────────────
    project = db.query(models.Project).filter(
        models.Project.project_id == job_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    if me.role not in ("admin",) and project.client.user_id != me.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    # ── Classify (or use cached sub_category if stored on project) ────────────
    classification = _classify(project.title, project.description)
    sub_category       = classification.get("sub_category", "")
    category           = classification.get("category", "")
    top3_predictions   = classification.get("top3_predictions")   # [[sub_cat, prob], ...]

    # ── Load candidates ───────────────────────────────────────────────────────
    candidates = _load_candidates(db)
    if not candidates:
        raise HTTPException(
            status_code=503,
            detail="No freelancer profiles available yet. "
                   "Ask freelancers to complete their profile (bio, title, or GitHub)."
        )

    # ── Score ─────────────────────────────────────────────────────────────────
    matches = _call_recommender(
        title             = project.title,
        description       = project.description,
        sub_category      = sub_category,
        category          = category,
        candidates        = candidates,
        budget_min        = float(project.budget or 0),
        budget_max        = float(project.budget or 0),
        top_k             = top_k,
        top3_predictions  = top3_predictions,
    )

    # ── Cache results ─────────────────────────────────────────────────────────
    _cache_results(db, job_id, matches)

    return RecommendResponse(
        job_id       = job_id,
        sub_category = sub_category,
        category     = category,
        matches      = [MatchedFreelancer(**m) for m in matches],
        latency_ms   = round((time.perf_counter() - t0) * 1000, 1),
    )


@router.post("/preview", response_model=RecommendResponse)
def recommend_preview(
    req: PreviewRequest,
    me:  models.User = Depends(require_client),
    db:  Session     = Depends(get_db),
):
    """
    Preview matches for a job that hasn't been posted yet.
    Called during the project creation wizard (Step 3: AI Skill Matching screen).
    Results are NOT cached — ephemeral.
    """
    t0 = time.perf_counter()

    classification     = _classify(req.title, req.description)
    sub_category       = classification.get("sub_category", "")
    category           = classification.get("category", "")
    top3_predictions   = classification.get("top3_predictions")

    candidates = _load_candidates(db)
    if not candidates:
        return RecommendResponse(
            job_id       = None,
            sub_category = sub_category,
            category     = category,
            matches      = [],
            latency_ms   = round((time.perf_counter() - t0) * 1000, 1),
        )

    matches = _call_recommender(
        title            = req.title,
        description      = req.description,
        sub_category     = sub_category,
        category         = category,
        candidates       = candidates,
        budget_min       = req.budget_min,
        budget_max       = req.budget_max,
        top_k            = req.top_k,
        top3_predictions = top3_predictions,
    )

    return RecommendResponse(
        job_id       = None,
        sub_category = sub_category,
        category     = category,
        matches      = [MatchedFreelancer(**m) for m in matches],
        latency_ms   = round((time.perf_counter() - t0) * 1000, 1),
    )


@router.get("/job/{job_id}/cached", response_model=RecommendResponse)
def get_cached_recommendations(
    job_id: int,
    me:     models.User = Depends(get_current_user),
    db:     Session     = Depends(get_db),
):
    """
    Return previously computed recommendations from the cache.
    Much faster than re-scoring — use this for the 'Applicants' dashboard view.
    """
    project = db.query(models.Project).filter(
        models.Project.project_id == job_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    cached = (
        db.query(models.Recommendation)
        .filter(models.Recommendation.project_id == job_id)
        .order_by(models.Recommendation.match_score.desc())
        .all()
    )
    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No cached recommendations. Call POST /recommend/job/{id} first."
        )

    matches = []
    for rec in cached:
        freelancer = db.query(models.Freelancer).filter(
            models.Freelancer.freelancer_id == rec.freelancer_id
        ).first()
        if not freelancer:
            continue
        skills = [fs.skill.name for fs in freelancer.skills if fs.skill]
        matches.append(MatchedFreelancer(
            freelancer_id      = rec.freelancer_id,
            name               = freelancer.user.email if freelancer.user else "",
            professional_title = freelancer.professional_title or "",
            github_url         = freelancer.github_url or "",
            hourly_rate        = float(freelancer.hourly_rate or 0),
            github_score       = int(freelancer.github_score or 0),
            match_score        = rec.match_score,
            matched_skills     = json.loads(rec.matched_skills or "[]"),
            explanation        = "",
            text_score         = rec.text_score,
            skill_score        = rec.skill_score,
            quality_score      = rec.quality_score,
            activity_score     = 0.0,
            classifier_weight  = 1.0,
            matched_on         = "",
        ))

    return RecommendResponse(
        job_id       = job_id,
        sub_category = "",
        category     = "",
        matches      = matches,
        latency_ms   = 0.0,
    )


@router.get("/my-matches", response_model=FreelancerMatchResponse)
def get_my_project_matches(
    top_k:         int            = Query(default=10, ge=1, le=20),
    min_budget:    Optional[float] = Query(default=None, ge=0),
    max_budget:    Optional[float] = Query(default=None, ge=0),
    contract_type: Optional[str]   = Query(default=None),
    me:            models.User    = Depends(require_freelancer),
    db:            Session        = Depends(get_db),
):
    """
    Return open projects that best match the current freelancer, drawn from
    cached client-triggered recommendations (fast — no AI call required).
    Supports optional filters: min_budget, max_budget, contract_type.
    """
    t0 = time.perf_counter()

    freelancer = (
        db.query(models.Freelancer)
        .filter(models.Freelancer.user_id == me.id)
        .first()
    )
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found.")

    query = (
        db.query(models.Recommendation)
        .join(models.Project, models.Recommendation.project_id == models.Project.project_id)
        .filter(models.Recommendation.freelancer_id == freelancer.freelancer_id)
        .filter(models.Project.status == models.ProjectStatus.open)
    )

    if min_budget is not None:
        query = query.filter(models.Project.budget >= min_budget)
    if max_budget is not None:
        query = query.filter(models.Project.budget <= max_budget)
    if contract_type and contract_type in ("fixed", "hourly"):
        query = query.filter(models.Project.contract_type == contract_type)

    recs = query.order_by(models.Recommendation.match_score.desc()).limit(top_k).all()

    matches = []
    for rec in recs:
        project = db.query(models.Project).filter(
            models.Project.project_id == rec.project_id
        ).first()
        if not project:
            continue
        matches.append(MatchedProject(
            project_id     = project.project_id,
            title          = project.title,
            description    = (project.description or "")[:300],
            budget         = float(project.budget or 0),
            contract_type  = (project.contract_type.value if project.contract_type else "fixed"),
            match_score    = rec.match_score,
            matched_skills = json.loads(rec.matched_skills or "[]"),
            text_score     = rec.text_score,
            skill_score    = rec.skill_score,
            quality_score  = rec.quality_score,
        ))

    return FreelancerMatchResponse(
        matches    = matches,
        latency_ms = round((time.perf_counter() - t0) * 1000, 1),
    )