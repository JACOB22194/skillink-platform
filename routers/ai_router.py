"""
routers/ai_router.py — Phase 4: AI Integration, Disputes & Verification
=========================================================================
Phase 5 update:
  - Messaging section REMOVED → lives in routers/messaging_router.py
  - notify() calls added to dispute resolution and verification review
    so users receive real-time notifications when these events happen

AI ENDPOINTS:
  GET  /projects/{id}/ai-match        → AI ranks freelancers for a project
  POST /projects/{id}/ai-pricing      → AI suggests a budget range for a project
  POST /proposals/{id}/score          → AI scores a proposal's relevance (0–100)

DISPUTE RESOLUTION (Admin):
  GET  /admin/disputes                → list all disputes
  GET  /admin/disputes/{id}           → get one dispute
  POST /admin/disputes/{id}/resolve   → resolve a dispute (release / refund / split)

VERIFICATION:
  POST  /verification/submit          → user submits identity verification document
  GET   /verification/status          → check your own verification status
  GET   /admin/verification           → admin: list all pending verifications
  PATCH /admin/verification/{id}      → admin: approve or reject verification

HOW AI CALLS WORK:
  The backend calls the AI service at AI_SERVICE_URL (set in docker-compose).
  If the AI service is down or times out, the backend falls back gracefully:
    - ai-match → returns freelancers sorted by success_score (database ranking)
    - ai-pricing → returns min=budget*0.6, max=budget*0.9 (simple heuristic)
    - proposal scoring → skill-overlap heuristic

  The AI service must expose these endpoints:
    POST /match       → { project_description, required_skills, freelancers[] }
    POST /pricing     → { title, description, budget }
    POST /score       → { project_description, cover_letter, bid_amount }
"""

import os
import httpx
import logging
from datetime import datetime, timezone
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_admin
from services.notification_service import notify

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Phase 4 — AI, Disputes & Verification"])

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai:8001")
AI_TIMEOUT     = 10.0
UPLOAD_DIR     = os.getenv("UPLOAD_DIR", "uploads")


# ════════════════════════════════════════════════════════════════════
#  AI ENDPOINTS
# ════════════════════════════════════════════════════════════════════

@router.get(
    "/projects/{project_id}/ai-match",
    response_model=schema.AIMatchResponse,
    summary="AI-ranked freelancer matches for a project",
    description="""
Calls the AI service to rank freelancers by how well they match this project.
Returns up to 10 ranked freelancers with an `ai_match_score` (0–100).
Falls back to success-score ranking if AI is unavailable.
""",
)
def ai_match_freelancers(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    freelancers = (
        db.query(models.Freelancer)
        .join(models.User, models.User.id == models.Freelancer.user_id)
        .filter(models.User.status == models.UserStatus.active)
        .all()
    )

    required_skills = [ps.skill.name for ps in project.skills if ps.skill]

    freelancer_payloads = []
    for f in freelancers:
        user        = db.query(models.User).filter(models.User.id == f.user_id).first()
        skill_names = [fs.skill.name for fs in f.skills if fs.skill]
        freelancer_payloads.append({
            "freelancer_id":  f.freelancer_id,
            "user_id":        f.user_id,
            "email":          user.email if user else "",
            "bio":            f.bio or "",
            "hourly_rate":    f.hourly_rate or 0,
            "success_score":  f.success_score or 0,
            "skills":         skill_names,
        })

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/match",
            json={
                "project_id":      project_id,
                "title":           project.title,
                "description":     project.description or "",
                "required_skills": required_skills,
                "budget":          project.budget,
                "freelancers":     freelancer_payloads,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data = response.json()

        matches = [
            schema.FreelancerSearchResult(
                freelancer_id  = m["freelancer_id"],
                user_id        = m["user_id"],
                email          = m["email"],
                bio            = m.get("bio"),
                hourly_rate    = m.get("hourly_rate"),
                success_score  = m.get("success_score", 0),
                skills         = m.get("skills", []),
                ai_match_score = m.get("score"),
            )
            for m in ai_data.get("matches", [])
        ]
        return schema.AIMatchResponse(project_id=project_id, matches=matches, source="ai")

    except Exception as exc:
        logger.warning("AI service unavailable for /match, using fallback. Error: %s", exc)

    fallback_matches = []
    for fp in sorted(freelancer_payloads, key=lambda x: x["success_score"], reverse=True)[:10]:
        fallback_matches.append(schema.FreelancerSearchResult(
            freelancer_id  = fp["freelancer_id"],
            user_id        = fp["user_id"],
            email          = fp["email"],
            bio            = fp.get("bio"),
            hourly_rate    = fp.get("hourly_rate"),
            success_score  = fp.get("success_score", 0),
            skills         = fp.get("skills", []),
            ai_match_score = None,
        ))
    return schema.AIMatchResponse(project_id=project_id, matches=fallback_matches, source="fallback")


@router.post(
    "/projects/{project_id}/ai-pricing",
    response_model=schema.AIPricingResponse,
    summary="AI-suggested budget range for a project",
    description="""
Calls the AI service to suggest a min/max budget. Saves to `ai_pricing` table.
Falls back to 60–90% of stated budget if AI is unavailable.
""",
)
def ai_suggest_pricing(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    required_skills = [ps.skill.name for ps in project.skills if ps.skill]
    suggested_min = None
    suggested_max = None
    reasoning     = None
    source        = "ai"

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/pricing",
            json={
                "project_id":      project_id,
                "title":           project.title,
                "description":     project.description or "",
                "required_skills": required_skills,
                "budget":          project.budget,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data       = response.json()
        suggested_min = ai_data.get("suggested_min")
        suggested_max = ai_data.get("suggested_max")
        reasoning     = ai_data.get("reasoning")

    except Exception as exc:
        logger.warning("AI service unavailable for /pricing, using fallback. Error: %s", exc)
        suggested_min = round(project.budget * 0.60, 2)
        suggested_max = round(project.budget * 0.90, 2)
        reasoning     = "AI service unavailable. Using heuristic: 60–90% of stated budget."
        source        = "fallback"

    existing = db.query(models.AIPricing).filter(
        models.AIPricing.project_id == project_id
    ).first()
    if existing:
        existing.suggested_min = suggested_min
        existing.suggested_max = suggested_max
    else:
        db.add(models.AIPricing(
            project_id    = project_id,
            suggested_min = suggested_min,
            suggested_max = suggested_max,
        ))
    db.commit()

    return schema.AIPricingResponse(
        project_id    = project_id,
        suggested_min = suggested_min,
        suggested_max = suggested_max,
        reasoning     = reasoning,
        source        = source,
    )


@router.post(
    "/proposals/{proposal_id}/score",
    response_model=schema.AIScoreResponse,
    summary="AI relevance score for a proposal",
    description="""
**Project owner (client) or admin only.**
Scores a freelancer's proposal 0–100 by relevance. Saves to `proposals.ai_relevance_score`.
""",
)
def ai_score_proposal(
    proposal_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    proposal = db.query(models.Proposal).filter(
        models.Proposal.proposal_id == proposal_id
    ).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found.")

    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != proposal.project.client_id:
            raise HTTPException(403, "You do not own this project.")

    project     = proposal.project
    freelancer  = proposal.freelancer
    skill_names = [fs.skill.name for fs in freelancer.skills if fs.skill]
    score       = None
    reasoning   = None

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/score",
            json={
                "project_title":       project.title,
                "project_description": project.description or "",
                "required_skills":     [ps.skill.name for ps in project.skills if ps.skill],
                "budget":              project.budget,
                "bid_amount":          proposal.bid_amount,
                "cover_letter":        proposal.cover_letter or "",
                "freelancer_skills":   skill_names,
                "freelancer_bio":      freelancer.bio or "",
                "success_score":       freelancer.success_score or 0,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data   = response.json()
        score     = ai_data.get("score")
        reasoning = ai_data.get("reasoning")

    except Exception as exc:
        logger.warning("AI service unavailable for /score. Error: %s", exc)
        required = {ps.skill.name.lower() for ps in project.skills if ps.skill}
        has      = {s.lower() for s in skill_names}
        overlap  = len(required & has)
        score    = round((overlap / max(len(required), 1)) * 80 + 10, 1)
        reasoning = "AI service unavailable. Score based on skill overlap."

    proposal.ai_relevance_score = score
    db.commit()

    return schema.AIScoreResponse(
        proposal_id        = proposal_id,
        ai_relevance_score = score,
        reasoning          = reasoning,
    )


# ════════════════════════════════════════════════════════════════════
#  DISPUTE RESOLUTION
# ════════════════════════════════════════════════════════════════════

@router.get(
    "/admin/disputes",
    response_model=list[schema.DisputeResponse],
    summary="List all disputes (admin only)",
    description="Filter by `status`: `open` or `resolved`. Default: all.",
)
def list_disputes(
    status: Optional[str] = Query(None, description="open | resolved"),
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(50, ge=1, le=200),
    admin:  models.User   = Depends(require_admin),
    db:     Session       = Depends(get_db),
):
    q = db.query(models.Dispute)
    if status:
        try:
            q = q.filter(models.Dispute.status == models.DisputeStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status '{status}'. Use: open, resolved")
    return q.order_by(models.Dispute.created_at.desc()).offset(skip).limit(limit).all()


@router.get(
    "/admin/disputes/{dispute_id}",
    response_model=schema.DisputeResponse,
    summary="Get a dispute by ID (admin only)",
)
def get_dispute(
    dispute_id: int,
    admin:      models.User = Depends(require_admin),
    db:         Session     = Depends(get_db),
):
    dispute = db.query(models.Dispute).filter(
        models.Dispute.dispute_id == dispute_id
    ).first()
    if not dispute:
        raise HTTPException(404, "Dispute not found.")
    return dispute


@router.post(
    "/admin/disputes/{dispute_id}/resolve",
    response_model=schema.MessageResponse,
    summary="Resolve a dispute (admin only)",
    description="""
Three resolution options:
- **`release_to_freelancer`** — freelancer keeps all escrowed funds
- **`refund_to_client`** — client gets a refund (simulated)
- **`split`** — requires `split_percentage` (0–100)

Notifications are sent to both parties on resolution.
""",
)
def resolve_dispute(
    dispute_id: int,
    body:       schema.DisputeResolveRequest,
    admin:      models.User = Depends(require_admin),
    db:         Session     = Depends(get_db),
):
    dispute = db.query(models.Dispute).filter(
        models.Dispute.dispute_id == dispute_id
    ).first()
    if not dispute:
        raise HTTPException(404, "Dispute not found.")
    if dispute.status == models.DisputeStatus.resolved:
        raise HTTPException(400, "This dispute is already resolved.")

    contract   = dispute.contract
    escrow     = contract.escrow
    freelancer = contract.freelancer
    escrow_amt = escrow.amount if escrow else 0.0

    if body.resolution == "release_to_freelancer":
        if escrow_amt > 0:
            freelancer.wallet_balance = (freelancer.wallet_balance or 0) + escrow_amt
            db.add(models.WalletTransaction(
                freelancer_id = freelancer.freelancer_id,
                amount        = escrow_amt,
                type          = models.TransactionType.deposit,
                description   = f"Dispute #{dispute_id} resolved — funds released to freelancer",
            ))

    elif body.resolution == "refund_to_client":
        pass  # Production: trigger payment gateway refund

    elif body.resolution == "split":
        if body.split_percentage is None:
            raise HTTPException(400, "split_percentage is required for 'split' resolution.")
        if not (0 <= body.split_percentage <= 100):
            raise HTTPException(400, "split_percentage must be between 0 and 100.")
        freelancer_share = round(escrow_amt * (body.split_percentage / 100), 2)
        if freelancer_share > 0:
            freelancer.wallet_balance = (freelancer.wallet_balance or 0) + freelancer_share
            db.add(models.WalletTransaction(
                freelancer_id = freelancer.freelancer_id,
                amount        = freelancer_share,
                type          = models.TransactionType.deposit,
                description   = (
                    f"Dispute #{dispute_id} resolved — {body.split_percentage}% "
                    f"split (${freelancer_share:.2f} to freelancer)"
                ),
            ))

    dispute.status          = models.DisputeStatus.resolved
    dispute.resolution_note = body.note
    dispute.resolved_by     = admin.id
    dispute.resolved_at     = datetime.now(timezone.utc)
    contract.status         = models.ContractStatus.completed
    contract.project.status = models.ProjectStatus.completed
    if escrow:
        escrow.status          = models.EscrowStatus.released
        escrow.released_amount = escrow_amt

    db.add(models.SystemLog(
        action       = (
            f"Admin [{admin.email}] resolved dispute #{dispute_id} "
            f"for contract #{contract.contract_id}: {body.resolution}"
        ),
        performed_by = admin.id,
    ))
    db.commit()

    # Notify freelancer
    notify(
        db        = db,
        user_id   = freelancer.user_id,
        type      = models.NotificationType.dispute,
        title     = f"Dispute #{dispute_id} resolved",
        body      = f"Resolution: {body.resolution}. {body.note}",
        entity_id = contract.contract_id,
    )
    # Notify client
    client_user_id = contract.project.client.user_id
    notify(
        db        = db,
        user_id   = client_user_id,
        type      = models.NotificationType.dispute,
        title     = f"Dispute #{dispute_id} resolved",
        body      = f"Resolution: {body.resolution}. {body.note}",
        entity_id = contract.contract_id,
    )

    return {
        "message": (
            f"Dispute #{dispute_id} resolved via '{body.resolution}'. "
            f"Contract #{contract.contract_id} marked as completed."
        )
    }


# ════════════════════════════════════════════════════════════════════
#  VERIFICATION
# ════════════════════════════════════════════════════════════════════

@router.post(
    "/verification/submit",
    response_model=schema.VerificationResponse,
    status_code=201,
    summary="Submit identity verification document",
    description="""
Upload an identity document (National ID, Passport, etc.) for review.
Only one verification per user. Resubmission overwrites a rejected one.
Accepted: **PDF, JPEG, PNG** — max **5 MB**.
""",
)
async def submit_verification(
    document_type: str        = Query(..., description="e.g. 'national_id', 'passport', 'drivers_license'"),
    file:          UploadFile = File(..., description="ID document (PDF/JPEG/PNG, max 5MB)"),
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    ALLOWED = {"application/pdf", "image/jpeg", "image/png"}
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Only PDF, JPEG, or PNG files are accepted for verification.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Document too large. Maximum is 5 MB.")

    ext      = (file.filename or "doc").rsplit(".", 1)[-1].lower()
    filename = f"verify_{me.id}_{int(datetime.now().timestamp())}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "verification")
    os.makedirs(save_dir, exist_ok=True)

    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    doc_path = f"/uploads/verification/{filename}"

    existing = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()

    if existing:
        if existing.status == models.VerificationStatus.approved:
            raise HTTPException(400, "Your account is already verified.")
        existing.document_type  = document_type
        existing.document_path  = doc_path
        existing.status         = models.VerificationStatus.pending
        existing.rejection_note = None
        existing.reviewed_by    = None
        existing.reviewed_at    = None
        verification = existing
    else:
        verification = models.Verification(
            user_id       = me.id,
            document_type = document_type,
            document_path = doc_path,
            status        = models.VerificationStatus.pending,
        )
        db.add(verification)

    db.commit()
    db.refresh(verification)
    return verification


@router.get(
    "/verification/status",
    response_model=schema.VerificationResponse,
    summary="Check your verification status",
)
def my_verification_status(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    v = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()
    if not v:
        raise HTTPException(404, "No verification request found. Submit one via POST /verification/submit.")
    return v


@router.get(
    "/admin/verification",
    response_model=list[schema.VerificationResponse],
    summary="List all verification requests (admin only)",
    description="Default: pending only. Pass `status=approved` or `status=rejected` to filter.",
)
def list_verifications(
    status: Optional[str] = Query("pending", description="pending | approved | rejected"),
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(50, ge=1, le=200),
    admin:  models.User   = Depends(require_admin),
    db:     Session       = Depends(get_db),
):
    q = db.query(models.Verification)
    if status:
        try:
            q = q.filter(models.Verification.status == models.VerificationStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status '{status}'. Use: pending, approved, rejected")
    return q.order_by(models.Verification.created_at.asc()).offset(skip).limit(limit).all()


@router.patch(
    "/admin/verification/{verification_id}",
    response_model=schema.VerificationResponse,
    summary="Approve or reject a verification (admin only)",
)
def review_verification(
    verification_id: int,
    body:            schema.VerificationReviewRequest,
    admin:           models.User = Depends(require_admin),
    db:              Session     = Depends(get_db),
):
    v = db.query(models.Verification).filter(
        models.Verification.verification_id == verification_id
    ).first()
    if not v:
        raise HTTPException(404, "Verification not found.")
    if v.status != models.VerificationStatus.pending:
        raise HTTPException(400, f"Verification is already '{v.status.value}'.")

    if body.action == "approve":
        v.status = models.VerificationStatus.approved
    else:
        if not body.rejection_note:
            raise HTTPException(400, "rejection_note is required when rejecting.")
        v.status         = models.VerificationStatus.rejected
        v.rejection_note = body.rejection_note

    v.reviewed_by = admin.id
    v.reviewed_at = datetime.now(timezone.utc)

    db.add(models.SystemLog(
        action       = f"Admin [{admin.email}] {body.action}d verification #{verification_id}",
        performed_by = admin.id,
    ))
    db.commit()
    db.refresh(v)

    # ── Phase 5: notify the user about their verification outcome ──
    if body.action == "approve":
        notify(
            db        = db,
            user_id   = v.user_id,
            type      = models.NotificationType.verification,
            title     = "Identity verification approved ✓",
            body      = "Your account is now verified.",
            entity_id = v.verification_id,
        )
    else:
        notify(
            db        = db,
            user_id   = v.user_id,
            type      = models.NotificationType.verification,
            title     = "Identity verification rejected",
            body      = f"Reason: {body.rejection_note}. Please resubmit.",
            entity_id = v.verification_id,
        )

    return v