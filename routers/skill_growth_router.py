"""
routers/skill_growth_router.py
────────────────────────────────
DEV-07: Skill Growth & Analytics endpoint.

Route:  POST /skill-growth/analyze
Wired into main.py via:
    from routers.skill_growth_router import router as skill_growth_router
    app.include_router(skill_growth_router)

DEV-07 Requirements covered:
  ✓ View Market Gap     — gap skills ranked by demand score
  ✓ Suggest Resources   — top Coursera courses per gap skill
  ✓ Category Scores     — coverage % per IT category (for radar chart)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from services.skill_growth_service import get_skill_growth_analysis

router = APIRouter(prefix="/skill-growth", tags=["Skill Growth & Analytics"])


# ── Request schema ─────────────────────────────────────────────────────────────

class SkillGrowthRequest(BaseModel):
    freelancer_id:  int
    skills:         List[str]      = Field(
                        default_factory=list,
                        example=["Python", "SQL", "React", "Pandas"]
                    )
    top_n_courses:  Optional[int]  = Field(5, ge=1, le=10)


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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=SkillGrowthResponse)
def analyze_skill_growth(req: SkillGrowthRequest):
    """
    DEV-07: Skill Growth & Analytics

    - Detects freelancer's IT categories from their skill list
    - Computes market gap (high-demand trending skills they're missing)
    - Recommends Coursera courses to close the gap
    - Returns category coverage scores for radar chart
    """
    if not req.skills:
        raise HTTPException(
            status_code=422,
            detail="skills list cannot be empty"
        )

    try:
        result = get_skill_growth_analysis(req.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Skill growth service error: {e}")

    return SkillGrowthResponse(
        freelancer_id        = result["freelancer_id"],
        known_skills         = result["known_skills"],
        known_skills_detail  = result["known_skills_detail"],
        top_categories       = result["top_categories"],
        market_gap           = result["market_gap"],
        recommended_courses  = result["recommended_courses"],
        category_scores      = result["category_scores"],
    )


@router.get("/health")
def skill_growth_health():
    """Quick health check for the Skill Growth module."""
    return {
        "status": "ok",
        "module": "Skill Growth & Analytics (DEV-07)"
    }