"""
ai_match_endpoint.py  (AI microservice at :8001)
─────────────────────────────────────────────────
The /match endpoint that the backend calls.
Sits alongside /classify and /parse-github in the same FastAPI app.

Add this to your existing AI service main.py:
    from ai_match_endpoint import router as match_router
    app.include_router(match_router)
"""

import asyncio
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

# ML-04 originally specified 5s, tuned for faster hardware. On constrained
# free-tier compute (e.g. Render's free plan), scoring even a single
# candidate measured ~4.9-5.6s, causing near-constant timeouts. Callers
# (recommend_router.py, matching_service.py) already allow up to 30s, so
# this can safely go higher without those call sites timing out first.
# Override via AI_INFERENCE_TIMEOUT if hardware changes.
_INFERENCE_TIMEOUT = float(os.getenv("AI_INFERENCE_TIMEOUT", "25.0"))  # seconds

from recommender import (
    SkillinkRecommender,
    JobInput,
    FreelancerCandidate,
)

router = APIRouter(tags=["Matching"])

recommender = SkillinkRecommender()


# ── Request / Response ────────────────────────────────────────────────────────

class CandidateIn(BaseModel):
    freelancer_id:      int
    user_id:            int
    name:               str
    professional_title: str
    bio:                str
    hourly_rate:        float
    success_score:      float
    github_score:       int
    github_url:         str
    skills:             list[str]
    top_languages:      list[str]
    sub_category_tags:  list[str]
    profile_text:       str
    github_stats:       dict


class MatchRequest(BaseModel):
    title:             str
    description:       str
    sub_category:      str
    category:          str
    budget_min:        float = 0.0
    budget_max:        float = 0.0
    required_skills:   list[str] = []
    candidates:        list[CandidateIn]
    top_k:             int   = 10
    # Top-3 classifier predictions: [[sub_cat, prob], ...]
    # Optional — falls back to single sub_category if absent.
    top3_predictions:  Optional[list[list]] = None
    weights:           Optional[dict] = None


class MatchOut(BaseModel):
    freelancer_id:     int
    name:              str
    professional_title:str
    github_url:        str
    hourly_rate:       float
    github_score:      int
    match_score:       float
    text_score:        float
    skill_score:       float
    quality_score:     float
    activity_score:    float
    classifier_weight: float     # which top-N prediction triggered this match
    matched_on:        str       # sub-category name that triggered the match
    matched_skills:    list[str]
    sub_category_tags: list[str]
    explanation:       str


class MatchResponse(BaseModel):
    matches: list[MatchOut]


# ── Endpoint ──────────────────────────────────────────────────────────────────

def _run_match(req: MatchRequest) -> list:
    top3 = None
    if req.top3_predictions:
        top3 = [(item[0], float(item[1])) for item in req.top3_predictions]

    job = JobInput(
        title             = req.title,
        description       = req.description,
        sub_category      = req.sub_category,
        category          = req.category,
        budget_min        = req.budget_min,
        budget_max        = req.budget_max,
        required_skills   = req.required_skills,
        top3_predictions  = top3,
    )

    candidates = [
        FreelancerCandidate(
            freelancer_id      = c.freelancer_id,
            user_id            = c.user_id,
            name               = c.name,
            professional_title = c.professional_title,
            bio                = c.bio,
            hourly_rate        = c.hourly_rate,
            success_score      = c.success_score,
            github_score       = c.github_score,
            github_url         = c.github_url,
            skills             = c.skills,
            top_languages      = c.top_languages,
            sub_category_tags  = c.sub_category_tags,
            profile_text       = c.profile_text,
            github_stats       = c.github_stats,
        )
        for c in req.candidates
    ]

    return recommender.recommend(job, candidates, top_k=req.top_k, weights=req.weights)


@router.post("/match", response_model=MatchResponse)
async def match_freelancers(req: MatchRequest):
    """
    Score all candidate freelancers against a job posting.
    Called by the backend /recommend endpoints — not called directly by frontend.
    """
    try:
        results = await asyncio.wait_for(
            asyncio.to_thread(_run_match, req),
            timeout=_INFERENCE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Inference timeout: exceeded 5 s limit")

    return MatchResponse(matches=[
        MatchOut(
            freelancer_id      = r.freelancer_id,
            name               = r.name,
            professional_title = r.professional_title,
            github_url         = r.github_url,
            hourly_rate        = r.hourly_rate,
            github_score       = r.github_score,
            match_score        = r.match_score,
            text_score         = r.text_score,
            skill_score        = r.skill_score,
            quality_score      = r.quality_score,
            activity_score     = r.activity_score,
            classifier_weight  = r.classifier_weight,
            matched_on         = r.matched_on,
            matched_skills     = r.matched_skills,
            sub_category_tags  = r.sub_category_tags,
            explanation        = r.explanation,
        )
        for r in results
    ])