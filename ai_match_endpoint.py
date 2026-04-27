"""
ai_match_endpoint.py  (AI microservice at :8001)
─────────────────────────────────────────────────
The /match endpoint that the backend calls.
Sits alongside /classify and /parse-github in the same FastAPI app.

Add this to your existing AI service main.py:
    from ai_match_endpoint import router as match_router
    app.include_router(match_router)
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import json

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
    candidates:        list[CandidateIn]
    top_k:             int   = 10
    # Top-3 classifier predictions: [[sub_cat, prob], ...]
    # Optional — falls back to single sub_category if absent.
    top3_predictions:  Optional[list[list]] = None


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

@router.post("/match", response_model=MatchResponse)
def match_freelancers(req: MatchRequest):
    """
    Score all candidate freelancers against a job posting.
    Called by the backend /recommend endpoints — not called directly by frontend.
    """
    # Convert top3_predictions from [[sub_cat, prob], ...] to [(sub_cat, prob), ...]
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

    results = recommender.recommend(job, candidates, top_k=req.top_k)

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