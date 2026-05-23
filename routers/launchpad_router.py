"""
routers/launchpad_router.py  (Skilllink-backend at :8000)
──────────────────────────────────────────────────────────
Phase 4 — Backend integration for DEV-04: AI Launchpad.

Endpoints:
  GET  /launchpad                     → get AI-recommended starter projects
                                        (calls AI service, freelancer only)
  POST /launchpad/reserve/{project_id} → claim/reserve a starter project
                                        (writes to launchpad_reservations table)
  GET  /launchpad/my-reservations     → list this freelancer's active reservations
  POST /launchpad/complete/{reservation_id} → mark a reservation as completed (admin/client)

Business rules (all match DEV-04 spec):
  - Only freelancers with is_beginner_qualified == True can reserve
  - Max 3 active reservations at a time (MAX_RESERVE_SLOTS from AI service)
  - Each (freelancer_id, project_id) can only be reserved once
  - Reservations expire after 7 days if not acted on
"""

from datetime import datetime, timedelta, timezone
import json
import os
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from auth import get_current_user, require_freelancer
from db import get_db
import models

router = APIRouter(prefix="/launchpad", tags=["AI Launchpad"])

AI_SERVICE_URL  = os.environ.get("AI_SERVICE_URL", "http://ai:8000")
MAX_RESERVE_SLOTS = 3
RESERVATION_DAYS  = 7   # how long a reservation stays active before expiring


# ── Request / Response schemas ────────────────────────────────────────────────

class StarterProjectOut(BaseModel):
    project_id:      int
    title:           str
    description:     str
    required_skills: list[str]
    difficulty:      str
    budget_min:      float
    budget_max:      float
    match_score:     float
    matched_skills:  list[str]
    is_reserved:     bool          # True if THIS freelancer already reserved it


class LaunchpadOut(BaseModel):
    is_beginner_qualified: bool
    reason:                str
    slots_used:            int
    slots_remaining:       int
    recommended_projects:  list[StarterProjectOut]
    latency_ms:            float


class ReservationOut(BaseModel):
    reservation_id:      int
    launchpad_project_id: int
    project_title:       str
    difficulty:          str
    budget_min:          float
    budget_max:          float
    match_score:         float
    status:              str
    reserved_at:         datetime
    expires_at:          Optional[datetime]


class ReserveResponse(BaseModel):
    message:        str
    reservation_id: int
    project_title:  str
    expires_at:     datetime
    slots_remaining: int


# ── Helper: call AI service /launchpad/recommend ──────────────────────────────

def _call_ai_launchpad(
    freelancer_id:      int,
    skills:             list[str],
    years_experience:   float,
    completed_projects: int,
    bio:                str,
) -> dict:
    """
    Calls POST /launchpad/recommend on the AI service.
    Mirrors how recommend_router.py calls /classify and /match.
    Raises 502/503 on failure — same error pattern as recommend_router.
    """
    try:
        with httpx.Client(timeout=15) as client:
            r = client.post(
                f"{AI_SERVICE_URL}/launchpad/recommend",
                json={
                    "freelancer_id":      freelancer_id,
                    "skills":             skills,
                    "years_experience":   years_experience,
                    "completed_projects": completed_projects,
                    "bio":                bio,
                },
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"AI Launchpad error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(503, f"AI service unreachable: {str(e)}")


# ── Helper: load freelancer data from DB ──────────────────────────────────────

def _get_freelancer_or_404(user: models.User, db: Session) -> models.Freelancer:
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == user.id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")
    return freelancer


def _active_reservation_count(freelancer_id: int, db: Session) -> int:
    """Count reservations that are still reserved or active (not completed/expired)."""
    return (
        db.query(models.LaunchpadReservation)
        .filter(
            models.LaunchpadReservation.freelancer_id == freelancer_id,
            models.LaunchpadReservation.status.in_([
                models.LaunchpadStatus.reserved,
                models.LaunchpadStatus.active,
            ]),
        )
        .count()
    )


def _already_reserved(
    freelancer_id: int,
    project_id:    int,
    db:            Session,
) -> bool:
    # Expired reservations do not block re-discovery; cancelled ones are deleted.
    return (
        db.query(models.LaunchpadReservation)
        .filter(
            models.LaunchpadReservation.freelancer_id        == freelancer_id,
            models.LaunchpadReservation.launchpad_project_id == project_id,
            models.LaunchpadReservation.status               != models.LaunchpadStatus.expired,
        )
        .first()
    ) is not None


# ── Endpoint 1: GET /launchpad ────────────────────────────────────────────────

@router.get("", response_model=LaunchpadOut)
def get_launchpad(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    """
    Returns AI-recommended starter projects for the current freelancer.

    Flow:
      1. Load freelancer profile + skills from DB
      2. Call AI service /launchpad/recommend
      3. Mark projects the freelancer has already reserved
      4. Return ranked list with slot count
    """
    t0         = time.perf_counter()
    freelancer = _get_freelancer_or_404(me, db)

    # Build skill list from DB
    skills = [fs.skill.name for fs in freelancer.skills if fs.skill]

    # Count platform completed projects (proposals accepted + contract completed)
    completed_projects = (
        db.query(models.Contract)
        .filter(
            models.Contract.freelancer_id == freelancer.freelancer_id,
            models.Contract.status        == models.ContractStatus.completed,
        )
        .count()
    )

    # Approximate years experience from profile text / github (fallback = 0)
    years_experience = float(freelancer.success_score or 0.0)

    # ── Call AI service ───────────────────────────────────────────────────────
    ai_result = _call_ai_launchpad(
        freelancer_id      = freelancer.freelancer_id,
        skills             = skills,
        years_experience   = years_experience,
        completed_projects = completed_projects,
        bio                = freelancer.bio or "",
    )

    # ── Slot tracking ─────────────────────────────────────────────────────────
    slots_used      = _active_reservation_count(freelancer.freelancer_id, db)
    slots_remaining = max(MAX_RESERVE_SLOTS - slots_used, 0)

    # ── Mark already-reserved projects ───────────────────────────────────────
    projects_out = []
    for proj in ai_result.get("recommended_projects", []):
        proj["is_reserved"] = _already_reserved(
            freelancer.freelancer_id, proj["project_id"], db
        )
        projects_out.append(StarterProjectOut(**proj))

    return LaunchpadOut(
        is_beginner_qualified = ai_result["is_beginner_qualified"],
        reason                = ai_result["reason"],
        slots_used            = slots_used,
        slots_remaining       = slots_remaining,
        recommended_projects  = projects_out,
        latency_ms            = round((time.perf_counter() - t0) * 1000, 1),
    )


# ── Endpoint 2: POST /launchpad/reserve/{project_id} ─────────────────────────

@router.post("/reserve/{project_id}", response_model=ReserveResponse, status_code=201)
def reserve_project(
    project_id: int,
    me:         models.User = Depends(require_freelancer),
    db:         Session     = Depends(get_db),
):
    """
    Reserve (claim) a starter project from the Launchpad pool.

    DEV-04: "The system shall allow the freelancer to Claim or Reserve a
    Launchpad project immediately (bypassing the competitive bidding process),
    provided they have available slots."

    Guards:
      - Freelancer must be beginner-qualified (re-verified via AI service)
      - Max 3 active reservations
      - Cannot reserve the same project twice
    """
    freelancer = _get_freelancer_or_404(me, db)

    # ── Slot check ────────────────────────────────────────────────────────────
    slots_used = _active_reservation_count(freelancer.freelancer_id, db)
    if slots_used >= MAX_RESERVE_SLOTS:
        raise HTTPException(
            400,
            f"You already have {slots_used} active reservations. "
            f"Complete or let one expire before reserving another "
            f"(max {MAX_RESERVE_SLOTS} slots)."
        )

    # ── Duplicate check ───────────────────────────────────────────────────────
    if _already_reserved(freelancer.freelancer_id, project_id, db):
        raise HTTPException(409, "You have already reserved this project.")

    # ── Re-verify beginner status + get project details from AI ───────────────
    skills             = [fs.skill.name for fs in freelancer.skills if fs.skill]
    completed_projects = (
        db.query(models.Contract)
        .filter(
            models.Contract.freelancer_id == freelancer.freelancer_id,
            models.Contract.status        == models.ContractStatus.completed,
        )
        .count()
    )

    ai_result = _call_ai_launchpad(
        freelancer_id      = freelancer.freelancer_id,
        skills             = skills,
        years_experience   = float(freelancer.success_score or 0.0),
        completed_projects = completed_projects,
        bio                = freelancer.bio or "",
    )

    if not ai_result["is_beginner_qualified"]:
        raise HTTPException(
            403,
            f"You no longer qualify for the Launchpad. {ai_result['reason']}"
        )

    # Find the specific project in the AI result
    project_data = next(
        (p for p in ai_result["recommended_projects"] if p["project_id"] == project_id),
        None,
    )
    if not project_data:
        raise HTTPException(
            404,
            f"Project {project_id} is not available in your Launchpad. "
            "It may have been taken or doesn't match your skills."
        )

    # ── Write reservation to DB ───────────────────────────────────────────────
    now        = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=RESERVATION_DAYS)

    reservation = models.LaunchpadReservation(
        freelancer_id        = freelancer.freelancer_id,
        launchpad_project_id = project_id,
        project_title        = project_data["title"],
        project_description  = project_data["description"][:1000],
        required_skills      = json.dumps(project_data.get("required_skills", [])),
        difficulty           = project_data.get("difficulty", "beginner"),
        budget_min           = project_data.get("budget_min", 0.0),
        budget_max           = project_data.get("budget_max", 0.0),
        match_score          = project_data.get("match_score", 0.0),
        status               = models.LaunchpadStatus.reserved,
        reserved_at          = now,
        expires_at           = expires_at,
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)

    slots_remaining = MAX_RESERVE_SLOTS - _active_reservation_count(
        freelancer.freelancer_id, db
    )

    return ReserveResponse(
        message         = f"'{project_data['title']}' has been reserved for you. You have {RESERVATION_DAYS} days to complete it.",
        reservation_id  = reservation.reservation_id,
        project_title   = reservation.project_title,
        expires_at      = expires_at,
        slots_remaining = slots_remaining,
    )


# ── Endpoint 3: GET /launchpad/my-reservations ────────────────────────────────

@router.get("/my-reservations", response_model=list[ReservationOut])
def my_reservations(
    status: Optional[str] = Query(None, description="Filter: reserved | active | completed | expired"),
    me:     models.User   = Depends(require_freelancer),
    db:     Session       = Depends(get_db),
):
    """
    List the current freelancer's Launchpad reservations.
    Optionally filter by status.
    """
    freelancer = _get_freelancer_or_404(me, db)

    # Auto-expire stale reservations before returning
    _expire_stale(freelancer.freelancer_id, db)

    query = db.query(models.LaunchpadReservation).filter(
        models.LaunchpadReservation.freelancer_id == freelancer.freelancer_id
    )

    if status:
        try:
            query = query.filter(
                models.LaunchpadReservation.status == models.LaunchpadStatus(status)
            )
        except ValueError:
            raise HTTPException(400, f"Invalid status '{status}'. Use: reserved, active, completed, expired")

    rows = query.order_by(models.LaunchpadReservation.reserved_at.desc()).all()

    return [
        ReservationOut(
            reservation_id       = r.reservation_id,
            launchpad_project_id = r.launchpad_project_id,
            project_title        = r.project_title,
            difficulty           = r.difficulty or "beginner",
            budget_min           = r.budget_min or 0.0,
            budget_max           = r.budget_max or 0.0,
            match_score          = r.match_score or 0.0,
            status               = r.status.value,
            reserved_at          = r.reserved_at,
            expires_at           = r.expires_at,
        )
        for r in rows
    ]


# ── Endpoint 4: POST /launchpad/complete/{reservation_id} ────────────────────

@router.post("/complete/{reservation_id}")
def complete_reservation(
    reservation_id: int,
    me:             models.User = Depends(get_current_user),
    db:             Session     = Depends(get_db),
):
    """
    Mark a Launchpad reservation as completed.
    Called by the freelancer themselves once they deliver, or by admin.
    Frees up one reservation slot.
    """
    reservation = db.query(models.LaunchpadReservation).filter(
        models.LaunchpadReservation.reservation_id == reservation_id
    ).first()

    if not reservation:
        raise HTTPException(404, "Reservation not found.")

    # Permission: must be the owning freelancer or admin
    if me.role != models.UserRole.admin:
        freelancer = _get_freelancer_or_404(me, db)
        if reservation.freelancer_id != freelancer.freelancer_id:
            raise HTTPException(403, "You do not own this reservation.")

    if reservation.status == models.LaunchpadStatus.completed:
        raise HTTPException(400, "This reservation is already completed.")

    if reservation.status == models.LaunchpadStatus.expired:
        raise HTTPException(400, "This reservation has expired and cannot be completed.")

    reservation.status       = models.LaunchpadStatus.completed
    reservation.completed_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": f"Reservation for '{reservation.project_title}' marked as completed."}


# ── Endpoint 5: POST /launchpad/cancel/{reservation_id} ──────────────────────

@router.post("/cancel/{reservation_id}")
def cancel_reservation(
    reservation_id: int,
    me:             models.User = Depends(require_freelancer),
    db:             Session     = Depends(get_db),
):
    """
    Cancel a Launchpad reservation.
    Deletes the row so the project reappears in Discover and the slot is freed.
    Only the owning freelancer can cancel, and only while status is reserved/active.
    """
    freelancer = _get_freelancer_or_404(me, db)

    reservation = db.query(models.LaunchpadReservation).filter(
        models.LaunchpadReservation.reservation_id == reservation_id,
        models.LaunchpadReservation.freelancer_id  == freelancer.freelancer_id,
    ).first()

    if not reservation:
        raise HTTPException(404, "Reservation not found.")

    if reservation.status not in (
        models.LaunchpadStatus.reserved,
        models.LaunchpadStatus.active,
    ):
        raise HTTPException(400, "Only active reservations can be cancelled.")

    title = reservation.project_title
    db.delete(reservation)
    db.commit()

    return {"message": f"Reservation for '{title}' has been cancelled."}


# ── Helper: expire stale reservations ─────────────────────────────────────────

def _expire_stale(freelancer_id: int, db: Session) -> None:
    """
    Mark any reservation past its expires_at as expired.
    Called lazily before GET /launchpad/my-reservations.
    """
    now = datetime.now(timezone.utc)
    stale = (
        db.query(models.LaunchpadReservation)
        .filter(
            models.LaunchpadReservation.freelancer_id == freelancer_id,
            models.LaunchpadReservation.status        == models.LaunchpadStatus.reserved,
            models.LaunchpadReservation.expires_at    <= now,
        )
        .all()
    )
    for r in stale:
        r.status = models.LaunchpadStatus.expired
    if stale:
        db.commit()