"""
routers/contract_router.py — Contract, Milestone & Review Endpoints
=====================================================================
GET    /contracts/{id}                   → get a contract (parties or admin)
GET    /contracts/my                     → get my contracts
POST   /contracts/{id}/milestones        → add a milestone (client)
GET    /contracts/{id}/milestones        → list milestones
PUT    /milestones/{milestone_id}/status → update milestone status
                                           approve → credits wallet (SINGLE place, no double payment)
POST   /contracts/{id}/complete          → mark contract as completed
POST   /contracts/{id}/dispute           → open a dispute
POST   /contracts/{id}/review            → client submits review after completion
GET    /contracts/{id}/review            → get review for a contract

PHASE 1-3 FIXES:
  - FIXED double-payment bug: wallet credit only in PUT /milestones/{id}/status approve
  - Milestone create saves title, description, due_date
  - Dispute stores opened_by and reason

PHASE 5:
  - notify() called for: contract creation, milestone approval/payment,
    contract completion, dispute opening, review submitted
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from db import get_db
import models
import schema
from auth import get_current_user, require_client
from services.notification_service import notify

router = APIRouter(tags=["Contracts & Milestones"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /contracts/my
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/contracts/my",
    response_model=list[schema.ContractResponse],
    summary="Get my contracts",
)
def my_contracts(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    opts = [joinedload(models.Contract.project), joinedload(models.Contract.milestones)]

    if me.role == models.UserRole.admin:
        return db.query(models.Contract).options(*opts).all()

    elif me.role == models.UserRole.client:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client:
            return []
        project_ids = [
            p.project_id for p in
            db.query(models.Project).filter(models.Project.client_id == client.client_id).all()
        ]
        if not project_ids:
            return []
        return db.query(models.Contract).options(*opts).filter(
            models.Contract.project_id.in_(project_ids)
        ).all()

    else:  # freelancer
        freelancer = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == me.id
        ).first()
        if not freelancer:
            return []
        return db.query(models.Contract).options(*opts).filter(
            models.Contract.freelancer_id == freelancer.freelancer_id
        ).all()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /contracts/{contract_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/contracts/{contract_id}",
    response_model=schema.ContractResponse,
    summary="Get a contract by ID",
)
def get_contract(
    contract_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).options(
        joinedload(models.Contract.project),
        joinedload(models.Contract.milestones),
    ).filter(models.Contract.contract_id == contract_id).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")
    _assert_contract_access(contract, me, db)
    return contract


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /contracts/{contract_id}/milestones
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/contracts/{contract_id}/milestones",
    response_model=schema.MilestoneResponse,
    status_code=201,
    summary="Add a milestone",
    description="""
**Client or admin only.** Add a payment milestone to an active contract.
- `amount` must be > 0 and not exceed remaining unfunded escrow balance
- Optionally provide `title`, `description`, and `due_date`
""",
)
def create_milestone(
    contract_id: int,
    body:        schema.MilestoneCreate,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    if contract.status != models.ContractStatus.active:
        raise HTTPException(400, "Can only add milestones to active contracts.")

    if me.role not in (models.UserRole.admin, models.UserRole.client):
        raise HTTPException(403, "Only the client or admin can add milestones.")

    if me.role == models.UserRole.client:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "You do not own this contract.")

    escrow = db.query(models.Escrow).filter(
        models.Escrow.contract_id == contract_id
    ).first()
    if escrow:
        existing_total = sum(m.amount for m in contract.milestones if m.amount)
        if existing_total + body.amount > escrow.amount:
            raise HTTPException(
                400,
                f"Total milestones (${existing_total + body.amount:.2f}) would exceed "
                f"escrow amount (${escrow.amount:.2f})."
            )

    milestone = models.Milestone(
        contract_id = contract_id,
        title       = body.title,
        description = body.description,
        amount      = body.amount,
        due_date    = body.due_date,
        status      = models.MilestoneStatus.pending,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)

    # Notify the freelancer about new milestone
    notify(
        db        = db,
        user_id   = contract.freelancer.user_id,
        type      = models.NotificationType.milestone,
        title     = f"New milestone added to contract #{contract_id}",
        body      = f"'{body.title or 'Milestone'}' — ${body.amount:.2f}",
        entity_id = contract_id,
    )

    return milestone


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /contracts/{contract_id}/milestones
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/contracts/{contract_id}/milestones",
    response_model=list[schema.MilestoneResponse],
    summary="List milestones for a contract",
)
def list_milestones(
    contract_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")
    _assert_contract_access(contract, me, db)
    return db.query(models.Milestone).filter(
        models.Milestone.contract_id == contract_id
    ).all()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PUT /milestones/{milestone_id}/status
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put(
    "/milestones/{milestone_id}/status",
    response_model=schema.MilestoneResponse,
    summary="Update milestone status",
    description="""
Allowed transitions:
- `pending` → `approved`  (client approves deliverable — wallet credited HERE, single place)
- `approved` → `paid`     (system/admin marks as paid)

**This is the ONLY place that credits the freelancer wallet.**
""",
)
def update_milestone_status(
    milestone_id: int,
    body:         schema.MilestoneStatusUpdate,
    me:           models.User = Depends(get_current_user),
    db:           Session     = Depends(get_db),
):
    milestone = db.query(models.Milestone).filter(
        models.Milestone.milestone_id == milestone_id
    ).first()
    if not milestone:
        raise HTTPException(404, "Milestone not found.")

    contract = milestone.contract
    _assert_contract_access(contract, me, db)

    current = milestone.status

    # Validate transition
    if body.status == models.MilestoneStatus.approved:
        if current != models.MilestoneStatus.pending:
            raise HTTPException(
                400,
                f"Cannot approve a milestone with status '{current.value}'. Must be 'pending'."
            )
        # Credit wallet — SINGLE place
        freelancer = contract.freelancer
        freelancer.wallet_balance = (freelancer.wallet_balance or 0) + milestone.amount

        db.add(models.WalletTransaction(
            freelancer_id = freelancer.freelancer_id,
            amount        = milestone.amount,
            type          = models.TransactionType.deposit,
            description   = (
                f"Milestone #{milestone_id} approved "
                f"({milestone.title or 'no title'}) — ${milestone.amount:.2f}"
            ),
        ))

        # Update escrow released_amount
        escrow = db.query(models.Escrow).filter(
            models.Escrow.contract_id == contract.contract_id
        ).first()
        if escrow:
            escrow.released_amount = (escrow.released_amount or 0) + milestone.amount
            db.add(models.Payment(
                escrow_id    = escrow.escrow_id,
                milestone_id = milestone.milestone_id,
                amount       = milestone.amount,
            ))

        milestone.status = models.MilestoneStatus.approved
        db.commit()

        # Notify freelancer: wallet credited
        notify(
            db        = db,
            user_id   = freelancer.user_id,
            type      = models.NotificationType.payment,
            title     = f"Milestone approved — ${milestone.amount:.2f} credited",
            body      = f"'{milestone.title or f'Milestone #{milestone_id}'}' was approved.",
            entity_id = contract.contract_id,
        )

    elif body.status == models.MilestoneStatus.paid:
        if current != models.MilestoneStatus.approved:
            raise HTTPException(
                400,
                f"Cannot mark paid a milestone with status '{current.value}'. Must be 'approved'."
            )
        milestone.status = models.MilestoneStatus.paid
        db.commit()

        # Notify freelancer
        notify(
            db        = db,
            user_id   = contract.freelancer.user_id,
            type      = models.NotificationType.milestone,
            title     = f"Milestone #{milestone_id} marked as paid",
            body      = f"Amount: ${milestone.amount:.2f}",
            entity_id = contract.contract_id,
        )

    else:
        raise HTTPException(
            400,
            f"Invalid status transition. Allowed: pending→approved or approved→paid."
        )

    db.refresh(milestone)
    return milestone


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /contracts/{contract_id}/complete
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/contracts/{contract_id}/complete",
    response_model=schema.MessageResponse,
    summary="Mark contract as completed",
    description="""
**Client or admin only.**
All milestones must be `paid` before completing.
Automatically sets the project status to `completed` and releases escrow.
""",
)
def complete_contract(
    contract_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    if contract.status != models.ContractStatus.active:
        raise HTTPException(400, f"Contract is already '{contract.status.value}'.")

    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "You do not own this contract.")

    unpaid = [m for m in contract.milestones if m.status != models.MilestoneStatus.paid]
    if unpaid:
        raise HTTPException(
            400,
            f"Cannot complete contract: {len(unpaid)} milestone(s) are not yet paid."
        )

    contract.status         = models.ContractStatus.completed
    contract.project.status = models.ProjectStatus.completed

    if contract.escrow:
        contract.escrow.status = models.EscrowStatus.released

    db.commit()

    # Notify freelancer
    notify(
        db        = db,
        user_id   = contract.freelancer.user_id,
        type      = models.NotificationType.contract,
        title     = f"Contract #{contract_id} completed 🎉",
        body      = f"Project '{contract.project.title}' has been marked as completed.",
        entity_id = contract_id,
    )

    return {"message": f"Contract #{contract_id} marked as completed."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /contracts/{contract_id}/dispute
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/contracts/{contract_id}/dispute",
    response_model=schema.MessageResponse,
    summary="Open a dispute",
    description="Either party can open a dispute on an active contract. Only one dispute per contract.",
)
def open_dispute(
    contract_id: int,
    reason:      schema.MessageResponse = None,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    if contract.status != models.ContractStatus.active:
        raise HTTPException(400, "Can only dispute active contracts.")

    _assert_contract_access(contract, me, db)

    existing = db.query(models.Dispute).filter(
        models.Dispute.contract_id == contract_id
    ).first()
    if existing:
        raise HTTPException(409, "A dispute already exists for this contract.")

    db.add(models.Dispute(
        contract_id = contract_id,
        opened_by   = me.id,
        reason      = reason.message if reason else None,
        status      = models.DisputeStatus.open,
    ))
    contract.status = models.ContractStatus.disputed
    db.commit()

    # Notify the other party
    freelancer = contract.freelancer
    client_user_id = contract.project.client.user_id

    if me.id == freelancer.user_id:
        # Freelancer opened it — notify client
        notify(
            db        = db,
            user_id   = client_user_id,
            type      = models.NotificationType.dispute,
            title     = f"Dispute opened on contract #{contract_id}",
            body      = reason.message if reason else "A dispute has been raised by the freelancer.",
            entity_id = contract_id,
        )
    else:
        # Client opened it — notify freelancer
        notify(
            db        = db,
            user_id   = freelancer.user_id,
            type      = models.NotificationType.dispute,
            title     = f"Dispute opened on contract #{contract_id}",
            body      = reason.message if reason else "A dispute has been raised by the client.",
            entity_id = contract_id,
        )

    return {"message": f"Dispute opened for contract #{contract_id}. An admin will review it."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /contracts/{contract_id}/review
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/contracts/{contract_id}/review",
    response_model=schema.ReviewResponse,
    status_code=201,
    summary="Submit a review for a completed contract",
    description="""
**Client only.** Submit a 1–5 star rating + optional comment for the freelancer.
- Contract must be `completed`
- Only one review per contract
- Updates the freelancer's `success_score` (rolling average)
""",
)
def submit_review(
    contract_id: int,
    body:        schema.ReviewCreate,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    if contract.status != models.ContractStatus.completed:
        raise HTTPException(400, "You can only review completed contracts.")

    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "Only the client who hired the freelancer can submit a review.")
    else:
        client = db.query(models.Client).filter(
            models.Client.client_id == contract.project.client_id
        ).first()

    existing = db.query(models.Review).filter(
        models.Review.project_id    == contract.project_id,
        models.Review.freelancer_id == contract.freelancer_id,
    ).first()
    if existing:
        raise HTTPException(409, "You have already reviewed this contract.")

    review = models.Review(
        project_id    = contract.project_id,
        freelancer_id = contract.freelancer_id,
        client_id     = client.client_id,
        rating        = body.rating,
        comment       = body.comment,
    )
    db.add(review)
    db.flush()

    # Update success_score
    freelancer  = contract.freelancer
    all_reviews = db.query(models.Review).filter(
        models.Review.freelancer_id == freelancer.freelancer_id
    ).all()
    total_ratings = sum(r.rating for r in all_reviews)
    freelancer.success_score = round(total_ratings / len(all_reviews), 2)

    db.commit()
    db.refresh(review)

    # Notify freelancer
    notify(
        db        = db,
        user_id   = freelancer.user_id,
        type      = models.NotificationType.review,
        title     = f"You received a {body.rating}★ review",
        body      = body.comment[:80] if body.comment else f"{body.rating} out of 5 stars.",
        entity_id = contract_id,
    )

    return review


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /contracts/{contract_id}/review
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/contracts/{contract_id}/review",
    response_model=schema.ReviewResponse,
    summary="Get the review for a contract",
)
def get_review(
    contract_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    _assert_contract_access(contract, me, db)

    review = db.query(models.Review).filter(
        models.Review.project_id    == contract.project_id,
        models.Review.freelancer_id == contract.freelancer_id,
    ).first()
    if not review:
        raise HTTPException(404, "No review found for this contract.")
    return review


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _assert_contract_access(contract: models.Contract, me: models.User, db: Session):
    if me.role == models.UserRole.admin:
        return
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if freelancer and freelancer.freelancer_id == contract.freelancer_id:
        return
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if client and contract.project.client_id == client.client_id:
        return
    raise HTTPException(403, "You do not have access to this contract.")