"""
routers/contract_router.py — Contract & Milestone Endpoints
=============================================================
GET    /contracts/{id}                          → get a contract (parties or admin)
GET    /contracts/my                            → get my contracts
POST   /contracts/{id}/milestones               → add a milestone to a contract
GET    /contracts/{id}/milestones               → list milestones for a contract
PUT    /milestones/{milestone_id}/status        → update milestone status
                                                  (approve → triggers escrow release for that amount)
POST   /contracts/{id}/complete                 → mark contract as completed
POST   /contracts/{id}/dispute                  → open a dispute on a contract
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_client, require_freelancer

router = APIRouter(tags=["Contracts & Milestones"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /contracts/my  — My contracts
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/contracts/my",
    response_model=list[schema.ContractResponse],
    summary="Get my contracts",
    description="""
- **Client** → contracts on your projects
- **Freelancer** → contracts you are working on
- **Admin** → all contracts
""",
)
def my_contracts(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    if me.role == models.UserRole.admin:
        return db.query(models.Contract).all()

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
        return db.query(models.Contract).filter(
            models.Contract.project_id.in_(project_ids)
        ).all()

    else:  # freelancer
        freelancer = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == me.id
        ).first()
        if not freelancer:
            return []
        return db.query(models.Contract).filter(
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
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
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
**Client or admin only.**

Add a payment milestone to an active contract.

- `amount` must be > 0 and not exceed the remaining unfunded escrow balance
- Milestone status starts as `pending`
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

    # Only client or admin
    if me.role not in (models.UserRole.admin, models.UserRole.client):
        raise HTTPException(403, "Only the client or admin can add milestones.")

    if me.role == models.UserRole.client:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "You do not own this contract.")

    # Validate total milestones don't exceed escrow amount
    escrow = db.query(models.Escrow).filter(
        models.Escrow.contract_id == contract_id
    ).first()
    if escrow:
        existing_total = sum(
            m.amount for m in contract.milestones if m.amount
        )
        if existing_total + body.amount > escrow.amount:
            raise HTTPException(
                400,
                f"Total milestones (${existing_total + body.amount:.2f}) would exceed "
                f"escrow amount (${escrow.amount:.2f})."
            )

    milestone = models.Milestone(
        contract_id = contract_id,
        amount      = body.amount,
        status      = models.MilestoneStatus.pending,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
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
- `pending` → `approved`  (client approves the deliverable)
- `approved` → `paid`     (system marks as paid after escrow release)

When a milestone is approved, the freelancer's wallet is credited
and an escrow payment record is created.

**Client approves; system handles payment.**
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

    if body.status == models.MilestoneStatus.approved:
        if milestone.status != models.MilestoneStatus.pending:
            raise HTTPException(400, "Only pending milestones can be approved.")

        # Only client can approve
        if me.role not in (models.UserRole.admin, models.UserRole.client):
            raise HTTPException(403, "Only the client can approve milestones.")

        if me.role == models.UserRole.client:
            client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
            if not client or contract.project.client_id != client.client_id:
                raise HTTPException(403, "You do not own this contract.")

        milestone.status = models.MilestoneStatus.approved

        # Credit the freelancer's wallet
        freelancer = contract.freelancer
        freelancer.wallet_balance = (freelancer.wallet_balance or 0) + milestone.amount

        # Record the wallet transaction
        db.add(models.WalletTransaction(
            freelancer_id = freelancer.freelancer_id,
            amount        = milestone.amount,
            type          = models.TransactionType.deposit,
        ))

        # Create payment record linked to escrow
        escrow = db.query(models.Escrow).filter(
            models.Escrow.contract_id == contract.contract_id
        ).first()
        if escrow:
            db.add(models.Payment(escrow_id=escrow.escrow_id))

    elif body.status == models.MilestoneStatus.paid:
        if milestone.status != models.MilestoneStatus.approved:
            raise HTTPException(400, "Only approved milestones can be marked as paid.")
        milestone.status = models.MilestoneStatus.paid

    else:
        raise HTTPException(400, "Invalid status. Use: approved or paid.")

    db.commit()
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

Marks the contract as `completed` and the project as `completed`.
All milestones must be `paid` before you can complete the contract.
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

    # Check all milestones are paid
    unpaid = [m for m in contract.milestones if m.status != models.MilestoneStatus.paid]
    if unpaid:
        raise HTTPException(
            400,
            f"Cannot complete contract: {len(unpaid)} milestone(s) are not yet paid."
        )

    contract.status         = models.ContractStatus.completed
    contract.project.status = models.ProjectStatus.completed

    # Release escrow
    if contract.escrow:
        contract.escrow.status = models.EscrowStatus.released

    db.commit()
    return {"message": f"Contract #{contract_id} marked as completed."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /contracts/{contract_id}/dispute
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/contracts/{contract_id}/dispute",
    response_model=schema.MessageResponse,
    summary="Open a dispute",
    description="""
Either party (client or freelancer) can open a dispute on an active contract.

Only one dispute per contract is allowed.
Admin resolves disputes via `POST /admin/disputes/{id}/resolve` (Phase 4).
""",
)
def open_dispute(
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
        raise HTTPException(400, "Can only dispute active contracts.")

    _assert_contract_access(contract, me, db)

    existing = db.query(models.Dispute).filter(
        models.Dispute.contract_id == contract_id
    ).first()
    if existing:
        raise HTTPException(409, "A dispute already exists for this contract.")

    db.add(models.Dispute(
        contract_id = contract_id,
        status      = models.DisputeStatus.open,
    ))
    contract.status = models.ContractStatus.disputed
    db.commit()
    return {"message": f"Dispute opened for contract #{contract_id}. An admin will review it."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _assert_contract_access(contract: models.Contract, me: models.User, db: Session):
    """Allows admin, the freelancer on the contract, or the client who owns the project."""
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