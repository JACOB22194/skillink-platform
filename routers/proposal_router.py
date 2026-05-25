"""
routers/proposal_router.py — Proposal Endpoints
=================================================
POST   /proposals                       → freelancer submits a proposal
GET    /proposals/project/{project_id}  → client/admin sees all proposals for a project
GET    /proposals/my                    → freelancer sees their own proposals
GET    /proposals/{proposal_id}         → get one proposal
PUT    /proposals/{proposal_id}/status  → client accepts or rejects a proposal
                                          (accepting auto-creates a Contract + Escrow)
DELETE /proposals/{proposal_id}         → freelancer withdraws a pending proposal

PHASE 5:
  - notify() called when proposal accepted or rejected
  - notify() called when a new proposal lands on client's project
"""

import os
import httpx
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_freelancer, require_client
from services.notification_service import notify

logger = logging.getLogger(__name__)

AI_SERVICE_URL          = os.getenv("AI_SERVICE_URL", "http://ai:8001")
AI_TIMEOUT              = 10.0
PROPOSAL_SCORE_THRESHOLD = 0.40   # must match ai_router.py

router = APIRouter(prefix="/proposals", tags=["Proposals"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /proposals  — Submit a proposal
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "",
    response_model=schema.ProposalResponse,
    status_code=201,
    summary="Submit a proposal",
    description="""
**Freelancers only.**
Submit a bid on an open project.
- Project must be `open`
- Cannot submit more than one proposal to the same project
- `bid_amount` must be at least $1.00
""",
)
def submit_proposal(
    body: schema.ProposalCreate,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == body.project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")
    if project.status != models.ProjectStatus.open:
        raise HTTPException(400, f"Project is '{project.status.value}', not accepting proposals.")

    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")

    existing = db.query(models.Proposal).filter(
        models.Proposal.project_id    == body.project_id,
        models.Proposal.freelancer_id == freelancer.freelancer_id,
    ).first()
    if existing:
        raise HTTPException(409, "You have already submitted a proposal for this project.")

    client = db.query(models.Client).filter(
        models.Client.user_id   == me.id,
        models.Client.client_id == project.client_id,
    ).first()
    if client:
        raise HTTPException(400, "You cannot bid on your own project.")

    proposal = models.Proposal(
        project_id         = body.project_id,
        freelancer_id      = freelancer.freelancer_id,
        bid_amount         = body.bid_amount,
        cover_letter       = body.cover_letter,
        ai_relevance_score = None,
        status             = models.ProposalStatus.pending,
    )

    # ── DEV-05 server-side Comprehension Gate ────────────────────────────────
    # Re-score the cover letter server-side so the gate cannot be bypassed
    # by calling POST /proposals directly (e.g. curl / API client).
    skill_names     = [fs.skill.name for fs in freelancer.skills if fs.skill]
    required_skills = [ps.skill.name for ps in project.skills if ps.skill]
    score: float    = 0.0

    try:
        ai_resp = httpx.post(
            f"{AI_SERVICE_URL}/score",
            json={
                "project_title":       project.title,
                "project_description": project.description or "",
                "required_skills":     required_skills,
                "budget":              project.budget,
                "bid_amount":          body.bid_amount,
                "cover_letter":        body.cover_letter or "",
                "freelancer_skills":   skill_names,
                "freelancer_bio":      freelancer.bio or "",
                "success_score":       freelancer.success_score or 0,
            },
            timeout=AI_TIMEOUT,
        )
        ai_resp.raise_for_status()
        raw = float(ai_resp.json().get("score", 0))
        score = raw / 100 if raw > 1.0 else raw
    except Exception as exc:
        logger.warning("AI gate fallback on submit: %s", exc)
        required = {s.lower() for s in required_skills}
        has      = {s.lower() for s in skill_names}
        overlap  = len(required & has)
        score    = round((overlap / max(len(required), 1)) * 0.80 + 0.10, 4)

    if score < PROPOSAL_SCORE_THRESHOLD:
        raise HTTPException(
            status_code=422,
            detail=(
                f"AI Comprehension Gate: proposal relevance score {round(score * 100)}% "
                f"is below the required {round(PROPOSAL_SCORE_THRESHOLD * 100)}% threshold. "
                "Improve your cover letter and re-check before submitting."
            ),
        )

    proposal.ai_relevance_score = score
    # ── end gate ─────────────────────────────────────────────────────────────
    db.add(proposal)
    db.commit()
    db.refresh(proposal)

    # Notify the client that a new proposal arrived
    client_user = db.query(models.User).join(
        models.Client, models.Client.user_id == models.User.id
    ).filter(models.Client.client_id == project.client_id).first()

    if client_user:
        notify(
            db        = db,
            user_id   = client_user.id,
            type      = models.NotificationType.proposal,
            title     = f"New proposal on '{project.title}'",
            body      = f"{me.email} bid ${body.bid_amount:.2f}",
            entity_id = body.project_id,
        )

    return proposal


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/project/{project_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/project/{project_id}",
    response_model=list[schema.ProposalResponse],
    summary="List proposals for a project",
    description="**Project owner (client) or admin only.** Sorted by bid amount.",
)
def list_proposals_for_project(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != project.client_id:
            raise HTTPException(403, "You do not own this project.")

    return (
        db.query(models.Proposal)
        .filter(models.Proposal.project_id == project_id)
        .order_by(models.Proposal.bid_amount.asc())
        .all()
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/my
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/my",
    response_model=list[schema.ProposalResponse],
    summary="My submitted proposals",
    description="**Freelancers only.** Returns all proposals you have submitted.",
)
def my_proposals(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        return []

    return (
        db.query(models.Proposal)
        .filter(models.Proposal.freelancer_id == freelancer.freelancer_id)
        .order_by(models.Proposal.proposal_id.desc())
        .all()
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/my/stats  — Freelancer proposal statistics
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/my/stats",
    summary="Proposal statistics for the logged-in freelancer",
)
def my_proposal_stats(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        return {"sent": 0, "accepted": 0, "rejected": 0, "response_rate": 0}

    proposals = db.query(models.Proposal).filter(
        models.Proposal.freelancer_id == freelancer.freelancer_id
    ).all()

    sent     = len(proposals)
    accepted = sum(1 for p in proposals if p.status == models.ProposalStatus.accepted)
    rejected = sum(1 for p in proposals if p.status == models.ProposalStatus.rejected)
    responded = accepted + rejected
    response_rate = round(responded / sent * 100) if sent > 0 else 0

    return {"sent": sent, "accepted": accepted, "rejected": rejected, "response_rate": response_rate}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/received  — All proposals on client's projects
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/received",
    response_model=list[schema.ProposalResponse],
    summary="Proposals received by the client",
    description="**Clients only.** Returns all proposals submitted on any of the client's projects.",
)
def received_proposals(
    me: models.User = Depends(require_client),
    db: Session     = Depends(get_db),
):
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client:
        return []
    project_ids = [
        p.project_id
        for p in db.query(models.Project).filter(
            models.Project.client_id == client.client_id
        ).all()
    ]
    if not project_ids:
        return []
    return (
        db.query(models.Proposal)
        .filter(models.Proposal.project_id.in_(project_ids))
        .order_by(models.Proposal.created_at.desc())
        .all()
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/{proposal_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/{proposal_id}",
    response_model=schema.ProposalResponse,
    summary="Get a proposal by ID",
)
def get_proposal(
    proposal_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    proposal = db.query(models.Proposal).filter(
        models.Proposal.proposal_id == proposal_id
    ).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found.")

    if me.role == models.UserRole.admin:
        return proposal

    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if freelancer and freelancer.freelancer_id == proposal.freelancer_id:
        return proposal

    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if client and client.client_id == proposal.project.client_id:
        return proposal

    raise HTTPException(403, "You do not have access to this proposal.")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PUT /proposals/{proposal_id}/status  — Accept or reject
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put(
    "/{proposal_id}/status",
    response_model=schema.ProposalStatusUpdateResponse,
    summary="Accept or reject a proposal",
    description="""
**Project owner (client) or admin only.**
- `action`: `accept` or `reject`

**When you accept:**
1. Proposal → `accepted`, others → `rejected`
2. Project → `in_progress`
3. Contract + Escrow created automatically
""",
)
def update_proposal_status(
    proposal_id: int,
    body:        schema.ProposalStatusUpdate,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    proposal = db.query(models.Proposal).filter(
        models.Proposal.proposal_id == proposal_id
    ).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found.")

    if proposal.status != models.ProposalStatus.pending:
        raise HTTPException(
            400,
            f"Proposal is already '{proposal.status.value}' and cannot be changed."
        )

    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != proposal.project.client_id:
            raise HTTPException(403, "You do not own this project.")

    if body.action not in ("accept", "reject"):
        raise HTTPException(400, "action must be 'accept' or 'reject'.")

    contract = None
    freelancer_user_id = proposal.freelancer.user_id

    if body.action == "accept":
        proposal.status = models.ProposalStatus.accepted

        # Reject all other pending proposals
        db.query(models.Proposal).filter(
            models.Proposal.project_id  == proposal.project_id,
            models.Proposal.proposal_id != proposal_id,
            models.Proposal.status      == models.ProposalStatus.pending,
        ).update({"status": models.ProposalStatus.rejected})

        proposal.project.status = models.ProjectStatus.in_progress

        contract = models.Contract(
            project_id    = proposal.project_id,
            freelancer_id = proposal.freelancer_id,
            status        = models.ContractStatus.active,
        )
        db.add(contract)
        db.flush()

        db.add(models.Escrow(
            contract_id = contract.contract_id,
            amount      = proposal.bid_amount,
            status      = models.EscrowStatus.held,
        ))

    else:  # reject
        proposal.status = models.ProposalStatus.rejected

    db.commit()

    # Notify the freelancer
    if body.action == "accept":
        notify(
            db        = db,
            user_id   = freelancer_user_id,
            type      = models.NotificationType.contract,
            title     = f"Proposal accepted — contract created! 🎉",
            body      = f"Your proposal on '{proposal.project.title}' was accepted. Contract #{contract.contract_id} is now active.",
            entity_id = contract.contract_id,
        )
    else:
        notify(
            db        = db,
            user_id   = freelancer_user_id,
            type      = models.NotificationType.proposal,
            title     = f"Proposal rejected",
            body      = f"Your proposal on '{proposal.project.title}' was not selected.",
            entity_id = proposal.project_id,
        )

    return schema.ProposalStatusUpdateResponse(
        proposal_id  = proposal.proposal_id,
        status       = proposal.status,
        contract_id  = contract.contract_id if contract else None,
        message      = (
            f"Proposal accepted. Contract #{contract.contract_id} created."
            if body.action == "accept"
            else "Proposal rejected."
        ),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /proposals/{proposal_id}  — Withdraw
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/{proposal_id}",
    response_model=schema.MessageResponse,
    summary="Withdraw a proposal",
    description="**Freelancer only.** You can only withdraw `pending` proposals.",
)
def withdraw_proposal(
    proposal_id: int,
    me:          models.User = Depends(require_freelancer),
    db:          Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    proposal = db.query(models.Proposal).filter(
        models.Proposal.proposal_id    == proposal_id,
        models.Proposal.freelancer_id  == freelancer.freelancer_id,
    ).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found or does not belong to you.")

    if proposal.status != models.ProposalStatus.pending:
        raise HTTPException(
            400,
            f"Cannot withdraw a proposal with status '{proposal.status.value}'."
        )

    db.delete(proposal)
    db.commit()
    return {"message": "Proposal withdrawn successfully."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /proposals/invite  — Client invites a freelancer (EMP-05)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/invite",
    response_model=schema.InvitationResponse,
    status_code=201,
    summary="Invite a freelancer to submit a proposal",
    description="""
**Clients only.**
Send a direct invitation to a specific freelancer for one of your open projects.
- Project must be `open`
- Cannot send duplicate invitations to the same freelancer for the same project
- Sends an in-app notification to the freelancer
""",
)
def invite_freelancer(
    body: schema.InviteFreelancerRequest,
    me:   models.User = Depends(require_client),
    db:   Session     = Depends(get_db),
):
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client:
        raise HTTPException(404, "Client profile not found.")

    project = db.query(models.Project).filter(
        models.Project.project_id == body.project_id,
        models.Project.client_id  == client.client_id,
    ).first()
    if not project:
        raise HTTPException(404, "Project not found or does not belong to you.")
    if project.status != models.ProjectStatus.open:
        raise HTTPException(400, f"Project is '{project.status.value}', not open for invitations.")

    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.freelancer_id == body.freelancer_id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer not found.")

    duplicate = db.query(models.Invitation).filter(
        models.Invitation.project_id    == body.project_id,
        models.Invitation.freelancer_id == body.freelancer_id,
    ).first()
    if duplicate:
        raise HTTPException(409, "You have already invited this freelancer to this project.")

    invitation = models.Invitation(
        project_id    = body.project_id,
        freelancer_id = body.freelancer_id,
        client_id     = client.client_id,
        message       = body.message,
        status        = models.InvitationStatus.pending,
    )
    db.add(invitation)
    db.flush()

    notify(
        db        = db,
        user_id   = freelancer.user_id,
        type      = models.NotificationType.proposal,
        title     = f"You've been invited to '{project.title}'",
        body      = body.message or f"{me.email} has invited you to submit a proposal.",
        entity_id = body.project_id,
    )

    db.commit()
    db.refresh(invitation)
    return invitation


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /proposals/{proposal_id}  — Edit
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/{proposal_id}",
    response_model=schema.ProposalResponse,
    summary="Edit a pending proposal (freelancer only)",
)
def edit_proposal(
    proposal_id: int,
    body:        schema.ProposalUpdate,
    me:          models.User = Depends(require_freelancer),
    db:          Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(models.Freelancer.user_id == me.id).first()
    proposal = db.query(models.Proposal).filter(
        models.Proposal.proposal_id   == proposal_id,
        models.Proposal.freelancer_id == freelancer.freelancer_id,
    ).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found.")
    if proposal.status != models.ProposalStatus.pending:
        raise HTTPException(400, "Only pending proposals can be edited.")
    if body.bid_amount is not None:
        proposal.bid_amount = body.bid_amount
    if body.cover_letter is not None:
        proposal.cover_letter = body.cover_letter
    db.commit()
    db.refresh(proposal)
    return proposal


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/invitations/sent  — Client sees invites they sent
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/invitations/sent",
    response_model=list[schema.InvitationSentResponse],
    summary="List all invitations sent by the current client",
)
def sent_invitations(
    me: models.User = Depends(require_client),
    db: Session     = Depends(get_db),
):
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client:
        raise HTTPException(404, "Client profile not found.")
    rows = (
        db.query(models.Invitation, models.Project, models.User)
        .join(models.Project,    models.Invitation.project_id    == models.Project.project_id)
        .join(models.Freelancer, models.Invitation.freelancer_id == models.Freelancer.freelancer_id)
        .join(models.User,       models.Freelancer.user_id       == models.User.id)
        .filter(models.Invitation.client_id == client.client_id)
        .order_by(models.Invitation.created_at.desc())
        .all()
    )
    return [
        schema.InvitationSentResponse(
            invitation_id    = inv.invitation_id,
            project_id       = inv.project_id,
            project_title    = proj.title,
            freelancer_id    = inv.freelancer_id,
            freelancer_email = usr.email,
            message          = inv.message,
            status           = inv.status.value,
            created_at       = inv.created_at,
        )
        for inv, proj, usr in rows
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/invitations/my  — Freelancer sees their invites
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/invitations/my",
    response_model=list[schema.InvitationDetailResponse],
    summary="List all invitations received by the current freelancer",
)
def my_invitations(
    me: models.User  = Depends(require_freelancer),
    db: Session      = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(models.Freelancer.user_id == me.id).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")
    rows = (
        db.query(models.Invitation, models.Project, models.User)
        .join(models.Project, models.Invitation.project_id == models.Project.project_id)
        .join(models.Client,  models.Invitation.client_id  == models.Client.client_id)
        .join(models.User,    models.Client.user_id        == models.User.id)
        .filter(models.Invitation.freelancer_id == freelancer.freelancer_id)
        .order_by(models.Invitation.created_at.desc())
        .all()
    )
    return [
        schema.InvitationDetailResponse(
            invitation_id = inv.invitation_id,
            project_id    = inv.project_id,
            project_title = proj.title,
            client_email  = usr.email,
            message       = inv.message,
            status        = inv.status.value,
            created_at    = inv.created_at,
        )
        for inv, proj, usr in rows
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /proposals/invitations/{id}/respond  — Accept / decline
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class _RespondBody(BaseModel):
    action: str  # "accept" | "decline"

@router.patch(
    "/invitations/{invitation_id}/respond",
    response_model=schema.InvitationResponse,
    summary="Accept or decline an invitation (freelancer only)",
)
def respond_invitation(
    invitation_id: int,
    body: _RespondBody,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(models.Freelancer.user_id == me.id).first()
    inv = db.query(models.Invitation).filter(
        models.Invitation.invitation_id  == invitation_id,
        models.Invitation.freelancer_id  == freelancer.freelancer_id,
    ).first()
    if not inv:
        raise HTTPException(404, "Invitation not found.")
    if inv.status != models.InvitationStatus.pending:
        raise HTTPException(400, f"Invitation already {inv.status.value}.")
    if body.action == "accept":
        inv.status = models.InvitationStatus.accepted
    elif body.action == "decline":
        inv.status = models.InvitationStatus.declined
    else:
        raise HTTPException(422, "action must be 'accept' or 'decline'.")
    db.commit()
    db.refresh(inv)
    return inv