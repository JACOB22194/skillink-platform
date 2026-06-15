"""
routers/launchpad_router.py
────────────────────────────
Phase 3 — AI Launchpad endpoint.

Route:  POST /launchpad/recommend
Wired into main.py via:
    from routers.launchpad_router import router as launchpad_router
    app.include_router(launchpad_router)

DEV-04 Requirements covered:
  ✓ Access Launchpad  — is_beginner_qualified gate
  ✓ View Starter Details — simplified project data returned
  ✓ Reserve Project  — is_reserved flag + slot enforcement
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

_INFERENCE_TIMEOUT = 5.0  # seconds — ML-04

from services.launchpad_service import (
    get_launchpad_recommendations,
    MAX_RESERVE_SLOTS,
)

router = APIRouter(prefix="/launchpad", tags=["AI Launchpad"])


# ── Request schema ────────────────────────────────────────────────────────────

class LaunchpadRequest(BaseModel):
    freelancer_id:      int
    skills:             List[str]        = Field(default_factory=list,
                                                  examples=[["python", "fastapi", "sql"]])
    years_experience:   float            = Field(0.0, ge=0.0, le=50.0,
                                                  examples=[0.5])
    completed_projects: int              = Field(0, ge=0,
                                                  examples=[0])
    bio:                Optional[str]    = Field("", examples=["Junior developer looking for first project."])


# ── Response schemas ──────────────────────────────────────────────────────────

class StarterProject(BaseModel):
    project_id:      int
    title:           str
    description:     str
    required_skills: List[str]
    difficulty:      str          # "beginner" | "easy"
    budget_min:      float
    budget_max:      float
    match_score:     float        # 0.0 – 1.0
    matched_skills:  List[str]    # skills the freelancer already has
    is_reserved:     bool


class LaunchpadResponse(BaseModel):
    freelancer_id:         int
    is_beginner_qualified: bool
    reason:                str
    max_reserve_slots:     int
    recommended_projects:  List[StarterProject]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/recommend", response_model=LaunchpadResponse)
async def recommend_launchpad(req: LaunchpadRequest):
    """
    AI Launchpad — returns starter projects tailored to a new freelancer.

    Steps (all inside launchpad_service.py):
      1. clf_beginner.joblib  → verify freelancer qualifies as beginner
      2. skill_map.json       → map skills to sub-categories
      3. pipeline_difficulty  → confirm each project is beginner/easy
      4. Skill-overlap score  → rank projects by relevance

    Returns an empty list with is_beginner_qualified=False if the
    freelancer does not meet the entry criteria.
    """
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(get_launchpad_recommendations, req.model_dump()),
            timeout=_INFERENCE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Inference timeout: exceeded 5 s limit")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Launchpad service error: {e}")

    projects = [StarterProject(**p) for p in result["recommended_projects"]]

    return LaunchpadResponse(
        freelancer_id         = result["freelancer_id"],
        is_beginner_qualified = result["is_beginner_qualified"],
        reason                = result["reason"],
        max_reserve_slots     = MAX_RESERVE_SLOTS,
        recommended_projects  = projects,
    )


@router.get("/health")
def launchpad_health():
    """Quick health check for the Launchpad module."""
    return {"status": "ok", "module": "AI Launchpad", "max_reserve_slots": MAX_RESERVE_SLOTS}