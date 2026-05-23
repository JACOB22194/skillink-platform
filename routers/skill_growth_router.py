"""
routers/skill_growth_router.py  (Skilllink-backend at :8000)
──────────────────────────────────────────────────────────────
DEV-07: Skill Growth & Analytics — Backend Router

Route:  POST /skill-growth/analyze
        GET  /skill-growth/my

Flow:
  1. Authenticate freelancer via JWT
  2. Load their skills from DB (FreelancerSkill → Skill)
  3. Call AI service POST /skill-growth/analyze at :8001
  4. Return structured gap + course recommendations

Mirrors the same pattern as recommend_router.py.
"""

import os
import time
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, require_freelancer
from db   import get_db
import models

router = APIRouter(prefix="/skill-growth", tags=["Skill Growth & Analytics"])

AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://ai:8000")


# ── Response schemas ───────────────────────────────────────────────────────────

class KnownSkillDetail(BaseModel):
    category:     str
    demand_score: int
    level:        str
    trending:     bool


class GapSkill(BaseModel):
    skill:        str
    category:     str
    demand_score: int
    level:        str


class RecommendedCourse(BaseModel):
    course_name:  str
    difficulty:   str
    rating:       float
    url:          str
    category:     str
    match_score:  float


class SkillGrowthResponse(BaseModel):
    freelancer_id:        int
    known_skills:         List[str]
    known_skills_detail:  List[KnownSkillDetail]
    top_categories:       List[str]
    market_gap:           List[GapSkill]
    recommended_courses:  List[RecommendedCourse]
    category_scores:      dict
    latency_ms:           float


# ── Helper: load freelancer skills from DB ─────────────────────────────────────

def _load_freelancer_skills(freelancer: models.Freelancer) -> list[str]:
    """Extract skill names from FreelancerSkill → Skill relationship."""
    return [fs.skill.name for fs in freelancer.skills if fs.skill]


# ── Helper: call AI service ────────────────────────────────────────────────────

def _call_ai_skill_growth(freelancer_id: int, skills: list[str], top_n: int) -> dict:
    """POST to AI microservice /skill-growth/analyze."""
    try:
        with httpx.Client(timeout=15) as client:
            r = client.post(
                f"{AI_SERVICE_URL}/skill-growth/analyze",
                json={
                    "freelancer_id": freelancer_id,
                    "skills":        skills,
                    "top_n_courses": top_n,
                },
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unreachable: {str(e)}")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/my", response_model=SkillGrowthResponse)
def get_my_skill_growth(
    top_n: int          = 5,
    me:    models.User  = Depends(require_freelancer),
    db:    Session      = Depends(get_db),
):
    """
    DEV-07: Get skill gap analysis for the currently logged-in freelancer.
    Skills are loaded automatically from their profile in the DB.

    Returns:
    - known_skills:        skills found in taxonomy
    - market_gap:          trending skills they are missing (ranked by demand)
    - recommended_courses: Coursera courses to close the gap
    - category_scores:     coverage % per IT category (for radar chart)
    """
    t0 = time.perf_counter()

    # Load freelancer profile
    freelancer = (
        db.query(models.Freelancer)
        .filter(models.Freelancer.user_id == me.id)
        .first()
    )
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found.")

    # Load skills from DB
    skills = _load_freelancer_skills(freelancer)
    if not skills:
        raise HTTPException(
            status_code=422,
            detail="No skills found on your profile. Add skills first."
        )

    # Call AI service
    result = _call_ai_skill_growth(freelancer.freelancer_id, skills, top_n)

    return SkillGrowthResponse(
        freelancer_id       = result["freelancer_id"],
        known_skills        = result["known_skills"],
        known_skills_detail = result["known_skills_detail"],
        top_categories      = result["top_categories"],
        market_gap          = result["market_gap"],
        recommended_courses = result["recommended_courses"],
        category_scores     = result["category_scores"],
        latency_ms          = round((time.perf_counter() - t0) * 1000, 1),
    )


@router.post("/analyze", response_model=SkillGrowthResponse)
def analyze_skills(
    skills: List[str],
    top_n:  int         = 5,
    me:     models.User = Depends(get_current_user),
    db:     Session     = Depends(get_db),
):
    """
    DEV-07: Analyze a custom skill list (used during profile setup or skill updates).
    Accepts skills directly in the request body — does not require DB skills.
    Available to both freelancers and clients.
    """
    t0 = time.perf_counter()

    if not skills:
        raise HTTPException(status_code=422, detail="skills list cannot be empty.")

    # Use user id as freelancer_id fallback
    freelancer = (
        db.query(models.Freelancer)
        .filter(models.Freelancer.user_id == me.id)
        .first()
    )
    freelancer_id = freelancer.freelancer_id if freelancer else me.id

    result = _call_ai_skill_growth(freelancer_id, skills, top_n)

    return SkillGrowthResponse(
        freelancer_id       = result["freelancer_id"],
        known_skills        = result["known_skills"],
        known_skills_detail = result["known_skills_detail"],
        top_categories      = result["top_categories"],
        market_gap          = result["market_gap"],
        recommended_courses = result["recommended_courses"],
        category_scores     = result["category_scores"],
        latency_ms          = round((time.perf_counter() - t0) * 1000, 1),
    )


@router.get("/health")
def skill_growth_health():
    return {"status": "ok", "module": "Skill Growth & Analytics (DEV-07)"}