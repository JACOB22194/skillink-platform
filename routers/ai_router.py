"""
routers/phase4_router.py — Phase 4: AI Integration, Disputes, Verification & Messaging
========================================================================================

AI ENDPOINTS:
  GET  /projects/{id}/ai-match        → AI ranks freelancers for a project
  POST /projects/{id}/ai-pricing      → AI suggests a budget range for a project
  POST /proposals/{id}/score          → AI scores a proposal's relevance (0–100)

DISPUTE RESOLUTION (Admin):
  GET  /admin/disputes                → list all disputes
  GET  /admin/disputes/{id}           → get one dispute
  POST /admin/disputes/{id}/resolve   → resolve a dispute (release / refund / split)

VERIFICATION:
  POST /verification/submit           → user submits identity verification document
  GET  /verification/status           → check your own verification status
  GET  /admin/verification            → admin: list all pending verifications
  PATCH /admin/verification/{id}      → admin: approve or reject verification

MESSAGING:
  POST /messages                      → send a message to another user
  GET  /messages/inbox                → list all conversations (grouped by partner)
  GET  /messages/{user_id}            → get full conversation with a user
  PATCH /messages/{user_id}/read      → mark all messages from a user as read

HOW AI CALLS WORK:
  The backend calls the AI service at AI_SERVICE_URL (set in docker-compose).
  If the AI service is down or times out, the backend falls back gracefully:
    - ai-match → returns freelancers sorted by success_score (database ranking)
    - ai-pricing → returns min=budget*0.6, max=budget*0.9 (simple heuristic)
    - proposal scoring → sets ai_relevance_score to None (AI pending)

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

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from db import get_db
import models
import schema
from auth import get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Phase 4"])

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai:8001")
AI_TIMEOUT     = 10.0   # seconds — if AI takes longer, fall back gracefully
UPLOAD_DIR     = os.getenv("UPLOAD_DIR", "uploads")


# ════════════════════════════════════════════════════════════════════
#  AI ENDPOINTS
# ════════════════════════════════════════════════════════════════════

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /projects/{project_id}/ai-match
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/projects/{project_id}/ai-match",
    response_model=schema.AIMatchResponse,
    summary="AI-ranked freelancer matches for a project",
    description="""
Calls the AI service to rank freelancers by how well they match this project.

Returns up to 10 ranked freelancers with an `ai_match_score` (0–100).

**Falls back gracefully** if AI service is unavailable: returns freelancers
sorted by their platform success score instead. `source` field indicates
`"ai"` or `"fallback"`.
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

    # Build freelancer list from DB
    freelancers = (
        db.query(models.Freelancer)
        .join(models.User, models.User.id == models.Freelancer.user_id)
        .filter(models.User.status == models.UserStatus.active)
        .all()
    )

    required_skills = [ps.skill.name for ps in project.skills if ps.skill]

    # Build payload for AI service
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

    # Try AI service
    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/match",
            json={
                "project_id":       project_id,
                "title":            project.title,
                "description":      project.description or "",
                "required_skills":  required_skills,
                "budget":           project.budget,
                "freelancers":      freelancer_payloads,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data = response.json()

        # AI service returns ranked list with scores
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
        return schema.AIMatchResponse(
            project_id = project_id,
            matches    = matches,
            source     = "ai",
        )

    except Exception as exc:
        logger.warning("AI service unavailable for /match, using fallback. Error: %s", exc)

    # Fallback: sort by success_score
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
    return schema.AIMatchResponse(
        project_id = project_id,
        matches    = fallback_matches,
        source     = "fallback",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /projects/{project_id}/ai-pricing
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/projects/{project_id}/ai-pricing",
    response_model=schema.AIPricingResponse,
    summary="AI-suggested budget range for a project",
    description="""
Calls the AI service to suggest a min/max budget for this project based on
its title, description, required skills, and the client's stated budget.

Saves the suggestion to the `ai_pricing` table. If called again, overwrites
the previous suggestion.

**Falls back gracefully** if AI is down: returns 60–90% of the stated budget.
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

    # Save / update in DB
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /proposals/{proposal_id}/score
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/proposals/{proposal_id}/score",
    response_model=schema.AIScoreResponse,
    summary="AI relevance score for a proposal",
    description="""
**Project owner (client) or admin only.**

Calls the AI service to score how relevant a freelancer's proposal is
to the project. Saves the score (0–100) to `proposals.ai_relevance_score`.

Use this when reviewing proposals to get AI-assisted ranking.
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

    # Only the project owner or admin
    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != proposal.project.client_id:
            raise HTTPException(403, "You do not own this project.")

    project    = proposal.project
    freelancer = proposal.freelancer
    skill_names = [fs.skill.name for fs in freelancer.skills if fs.skill]

    score     = None
    reasoning = None

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
        # Fallback: simple skill-overlap heuristic
        required = {ps.skill.name.lower() for ps in project.skills if ps.skill}
        has      = {s.lower() for s in skill_names}
        overlap  = len(required & has)
        score    = round((overlap / max(len(required), 1)) * 80 + 10, 1)
        reasoning = "AI service unavailable. Score based on skill overlap."

    # Save to proposal
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

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/disputes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/disputes/{dispute_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /admin/disputes/{dispute_id}/resolve
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/admin/disputes/{dispute_id}/resolve",
    response_model=schema.MessageResponse,
    summary="Resolve a dispute (admin only)",
    description="""
Three resolution options:

- **`release_to_freelancer`** — freelancer keeps all escrowed funds
- **`refund_to_client`** — client gets all escrowed funds back (wallet debit)
- **`split`** — requires `split_percentage` (0–100); that % goes to freelancer, rest to client

In all cases:
- Dispute status → `resolved`
- Contract status → `completed`
- Escrow status → `released`
- System log entry written
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
        # Credit entire escrow to freelancer
        if escrow_amt > 0:
            freelancer.wallet_balance = (freelancer.wallet_balance or 0) + escrow_amt
            db.add(models.WalletTransaction(
                freelancer_id = freelancer.freelancer_id,
                amount        = escrow_amt,
                type          = models.TransactionType.deposit,
                description   = f"Dispute #{dispute_id} resolved — funds released to freelancer",
            ))

    elif body.resolution == "refund_to_client":
        # No wallet credit — money goes back to client (simulated)
        pass  # In production: trigger payment gateway refund here

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

    # Update dispute
    dispute.status          = models.DisputeStatus.resolved
    dispute.resolution_note = body.note
    dispute.resolved_by     = admin.id
    dispute.resolved_at     = datetime.now(timezone.utc)

    # Update contract and escrow
    contract.status = models.ContractStatus.completed
    if escrow:
        escrow.status          = models.EscrowStatus.released
        escrow.released_amount = escrow_amt

    # Update project
    contract.project.status = models.ProjectStatus.completed

    # Write system log
    db.add(models.SystemLog(
        action       = (
            f"Admin [{admin.email}] resolved dispute #{dispute_id} "
            f"for contract #{contract.contract_id}: {body.resolution}"
        ),
        performed_by = admin.id,
    ))

    db.commit()
    return {
        "message": (
            f"Dispute #{dispute_id} resolved via '{body.resolution}'. "
            f"Contract #{contract.contract_id} marked as completed."
        )
    }


# ════════════════════════════════════════════════════════════════════
#  VERIFICATION
# ════════════════════════════════════════════════════════════════════

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /verification/submit
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/verification/submit",
    response_model=schema.VerificationResponse,
    status_code=201,
    summary="Submit identity verification document",
    description="""
Upload an identity document (National ID, Passport, etc.) for review.
Only one verification request per user. Resubmission overwrites a previous rejection.

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

    # Save file
    ext      = (file.filename or "doc").rsplit(".", 1)[-1].lower()
    filename = f"verify_{me.id}_{int(datetime.now().timestamp())}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "verification")
    os.makedirs(save_dir, exist_ok=True)

    import aiofiles
    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    doc_path = f"/uploads/verification/{filename}"

    # Upsert verification record
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /verification/status
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/verification
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /admin/verification/{verification_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
    return v


# ════════════════════════════════════════════════════════════════════
#  MESSAGING
# ════════════════════════════════════════════════════════════════════

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /messages
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/messages",
    response_model=schema.ChatMessageResponse,
    status_code=201,
    summary="Send a message to another user",
    description="Both users must be active. You cannot message yourself.",
)
def send_message(
    body: schema.MessageCreate,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if body.receiver_id == me.id:
        raise HTTPException(400, "You cannot send a message to yourself.")

    receiver = db.query(models.User).filter(
        models.User.id     == body.receiver_id,
        models.User.status == models.UserStatus.active,
    ).first()
    if not receiver:
        raise HTTPException(404, "Recipient not found or is suspended.")

    msg = models.Message(
        sender_id   = me.id,
        receiver_id = body.receiver_id,
        content     = body.content,
        is_read     = False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /messages/inbox
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/messages/inbox",
    response_model=list[schema.ConversationSummary],
    summary="List all conversations (inbox view)",
    description="Returns one summary per conversation partner, newest first.",
)
def get_inbox(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    # Get all messages involving this user
    all_messages = (
        db.query(models.Message)
        .filter(
            or_(
                models.Message.sender_id   == me.id,
                models.Message.receiver_id == me.id,
            )
        )
        .order_by(models.Message.sent_at.desc())
        .all()
    )

    # Group by conversation partner
    seen_partners = {}
    summaries     = []

    for msg in all_messages:
        other_id = msg.receiver_id if msg.sender_id == me.id else msg.sender_id
        if other_id in seen_partners:
            continue

        seen_partners[other_id] = True
        other_user = db.query(models.User).filter(models.User.id == other_id).first()

        # Count unread from this partner
        unread_count = (
            db.query(models.Message)
            .filter(
                models.Message.sender_id   == other_id,
                models.Message.receiver_id == me.id,
                models.Message.is_read     == False,  # noqa: E712
            )
            .count()
        )

        summaries.append(schema.ConversationSummary(
            other_user_id    = other_id,
            other_user_email = other_user.email if other_user else "Unknown",
            last_message     = msg.content[:80] + ("..." if len(msg.content) > 80 else ""),
            last_message_at  = msg.sent_at,
            unread_count     = unread_count,
        ))

    return summaries


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /messages/{other_user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/messages/{other_user_id}",
    response_model=list[schema.ChatMessageResponse],
    summary="Get full conversation with a user",
    description="Returns all messages between you and the given user, oldest first.",
)
def get_conversation(
    other_user_id: int,
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    other = db.query(models.User).filter(models.User.id == other_user_id).first()
    if not other:
        raise HTTPException(404, "User not found.")

    messages = (
        db.query(models.Message)
        .filter(
            or_(
                and_(
                    models.Message.sender_id   == me.id,
                    models.Message.receiver_id == other_user_id,
                ),
                and_(
                    models.Message.sender_id   == other_user_id,
                    models.Message.receiver_id == me.id,
                ),
            )
        )
        .order_by(models.Message.sent_at.asc())
        .all()
    )

    # Auto-mark incoming messages as read
    for msg in messages:
        if msg.receiver_id == me.id and not msg.is_read:
            msg.is_read = True
    db.commit()

    return messages


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /messages/{other_user_id}/read
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/messages/{other_user_id}/read",
    response_model=schema.MessageResponse,
    summary="Mark all messages from a user as read",
)
def mark_messages_read(
    other_user_id: int,
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    updated = (
        db.query(models.Message)
        .filter(
            models.Message.sender_id   == other_user_id,
            models.Message.receiver_id == me.id,
            models.Message.is_read     == False,  # noqa: E712
        )
        .update({"is_read": True})
    )
    db.commit()
    return {"message": f"Marked {updated} message(s) as read."}