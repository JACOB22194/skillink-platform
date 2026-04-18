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
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_freelancer, require_client

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

Rules:
- Project must be `open`
- You cannot submit more than one proposal to the same project
- `bid_amount` must be at least $1.00
""",
)
def submit_proposal(
    body: schema.ProposalCreate,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    # Check project exists and is open
    project = db.query(models.Project).filter(
        models.Project.project_id == body.project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")
    if project.status != models.ProjectStatus.open:
        raise HTTPException(400, f"Project is '{project.status.value}', not accepting proposals.")

    # Get freelancer profile
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")

    # No duplicate proposals
    existing = db.query(models.Proposal).filter(
        models.Proposal.project_id    == body.project_id,
        models.Proposal.freelancer_id == freelancer.freelancer_id,
    ).first()
    if existing:
        raise HTTPException(409, "You have already submitted a proposal for this project.")

    # Cannot bid on your own project (edge case: same person has both roles)
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
        ai_relevance_score = None,  # AI service will fill this in Phase 4
        status             = models.ProposalStatus.pending,
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/project/{project_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/project/{project_id}",
    response_model=list[schema.ProposalResponse],
    summary="List proposals for a project",
    description="""
**Project owner (client) or admin only.**

Returns all proposals submitted for a specific project,
sorted by bid amount (lowest first).
""",
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

    # Only the owning client or admin can see all proposals
    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != project.client_id:
            raise HTTPException(403, "You do not own this project.")

    proposals = (
        db.query(models.Proposal)
        .filter(models.Proposal.project_id == project_id)
        .order_by(models.Proposal.bid_amount.asc())
        .all()
    )
    return proposals


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /proposals/my  — My proposals
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
#  GET /proposals/{proposal_id}  — One proposal
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

    # Only the freelancer who submitted, the project owner, or admin can view
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
1. Proposal status → `accepted`
2. All other proposals for the same project → `rejected`
3. Project status → `in_progress`
4. A **Contract** is automatically created
5. An **Escrow** record is created (status: `held`, amount = bid_amount)

The client must then call `POST /escrow/fund/{contract_id}` to actually
transfer funds into escrow (payment integration step).
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

    # Permission check
    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != proposal.project.client_id:
            raise HTTPException(403, "You do not own this project.")

    if body.action not in ("accept", "reject"):
        raise HTTPException(400, "action must be 'accept' or 'reject'.")

    contract = None

    if body.action == "accept":
        proposal.status = models.ProposalStatus.accepted

        # Reject all other pending proposals for this project
        db.query(models.Proposal).filter(
            models.Proposal.project_id  == proposal.project_id,
            models.Proposal.proposal_id != proposal_id,
            models.Proposal.status      == models.ProposalStatus.pending,
        ).update({"status": models.ProposalStatus.rejected})

        # Move project to in_progress
        proposal.project.status = models.ProjectStatus.in_progress

        # Create the contract
        contract = models.Contract(
            project_id    = proposal.project_id,
            freelancer_id = proposal.freelancer_id,
            status        = models.ContractStatus.active,
        )
        db.add(contract)
        db.flush()

        # Create the escrow record
        db.add(models.Escrow(
            contract_id = contract.contract_id,
            amount      = proposal.bid_amount,
            status      = models.EscrowStatus.held,
        ))

    else:  # reject
        proposal.status = models.ProposalStatus.rejected

    db.commit()

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