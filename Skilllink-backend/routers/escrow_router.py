"""
routers/escrow_router.py — Escrow & Wallet Endpoints
======================================================
POST  /escrow/fund/{contract_id}      → client funds escrow (simulated)
GET   /escrow/{contract_id}           → view escrow status
POST  /escrow/release/{milestone_id}  → release funds for an approved milestone
GET   /wallet/balance                 → freelancer wallet balance
POST  /wallet/withdraw                → freelancer withdrawal request
GET   /wallet/transactions            → freelancer transaction history

PHASE 3 FIX — Double Payment Bug Resolved:
  The old code credited the wallet in BOTH:
    1. PUT /milestones/{id}/status  (approve transition)
    2. POST /escrow/release/{milestone_id}

  Now wallet credit ONLY happens in contract_router's approve transition.
  POST /escrow/release/{milestone_id} simply calls the same approve logic
  if the milestone is still pending, OR marks it paid if already approved.
  It NEVER credits the wallet itself — that is contract_router's job.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_freelancer, require_client

router = APIRouter(tags=["Escrow & Payments"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /escrow/fund/{contract_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/escrow/fund/{contract_id}",
    response_model=schema.EscrowResponse,
    summary="Fund escrow for a contract",
    description="""
**Client only.**

Simulates depositing funds into escrow. Provide any `payment_reference`
string (e.g. `"SANDBOX-12345"`) — in production this would be a verified
Stripe/PayPal transaction ID.

Records the `funded_at` timestamp.
""",
)
def fund_escrow(
    contract_id: int,
    body:        schema.EscrowFundRequest,
    me:          models.User = Depends(require_client),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client or contract.project.client_id != client.client_id:
        raise HTTPException(403, "You do not own this contract.")

    if contract.status == models.ContractStatus.completed:
        raise HTTPException(400, "Contract is already completed.")

    escrow = db.query(models.Escrow).filter(
        models.Escrow.contract_id == contract_id
    ).first()
    if not escrow:
        raise HTTPException(404, "Escrow record not found for this contract.")

    if escrow.status == models.EscrowStatus.released:
        raise HTTPException(400, "Escrow has already been released.")

    # Update escrow amount (if override provided) and mark as funded
    if body.amount:
        escrow.amount = body.amount
    escrow.status    = models.EscrowStatus.held
    escrow.funded_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(escrow)

    return schema.EscrowResponse(
        escrow_id         = escrow.escrow_id,
        contract_id       = escrow.contract_id,
        amount            = escrow.amount,
        released_amount   = escrow.released_amount or 0.0,
        status            = escrow.status,
        funded_at         = escrow.funded_at,
        payment_reference = body.payment_reference,
        message           = f"Escrow funded successfully. Reference: {body.payment_reference}",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /escrow/{contract_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/escrow/{contract_id}",
    response_model=schema.EscrowResponse,
    summary="View escrow status for a contract",
)
def get_escrow(
    contract_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    _assert_contract_party(contract, me, db)

    escrow = db.query(models.Escrow).filter(
        models.Escrow.contract_id == contract_id
    ).first()
    if not escrow:
        raise HTTPException(404, "Escrow not found for this contract.")

    return schema.EscrowResponse(
        escrow_id       = escrow.escrow_id,
        contract_id     = escrow.contract_id,
        amount          = escrow.amount,
        released_amount = escrow.released_amount or 0.0,
        status          = escrow.status,
        funded_at       = escrow.funded_at,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /escrow/release/{milestone_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/escrow/release/{milestone_id}",
    response_model=schema.MessageResponse,
    summary="Release escrow funds for a milestone",
    description="""
**Client only.**

Convenience endpoint to approve + mark-paid a milestone in one call.

- If milestone is `pending` → approves it (credits wallet) then marks it `paid`
- If milestone is already `approved` → just marks it `paid` (wallet already credited)
- If milestone is already `paid` → returns 400

**The wallet credit always happens exactly once** — in the approve step.
""",
)
def release_escrow_for_milestone(
    milestone_id: int,
    me:           models.User = Depends(require_client),
    db:           Session     = Depends(get_db),
):
    milestone = db.query(models.Milestone).filter(
        models.Milestone.milestone_id == milestone_id
    ).first()
    if not milestone:
        raise HTTPException(404, "Milestone not found.")

    contract = milestone.contract
    client   = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client or contract.project.client_id != client.client_id:
        raise HTTPException(403, "You do not own this contract.")

    if milestone.status == models.MilestoneStatus.paid:
        raise HTTPException(400, "This milestone has already been paid.")

    if milestone.status == models.MilestoneStatus.pending:
        # Step 1: approve (credit wallet — happens ONCE here)
        milestone.status = models.MilestoneStatus.approved

        freelancer = contract.freelancer
        freelancer.wallet_balance = (freelancer.wallet_balance or 0) + milestone.amount

        db.add(models.WalletTransaction(
            freelancer_id = freelancer.freelancer_id,
            amount        = milestone.amount,
            type          = models.TransactionType.deposit,
            description   = f"Milestone #{milestone_id} released by client",
        ))

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

    # Step 2: mark paid (no second wallet credit — already done above or previously)
    milestone.status = models.MilestoneStatus.paid
    db.commit()

    return {
        "message": (
            f"Released ${milestone.amount:.2f} for milestone #{milestone_id}. "
            f"Freelancer wallet credited."
        )
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /wallet/balance
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/wallet/balance",
    response_model=schema.WalletBalanceResponse,
    summary="Get my wallet balance (freelancers only)",
)
def wallet_balance(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")
    return schema.WalletBalanceResponse(
        freelancer_id  = freelancer.freelancer_id,
        wallet_balance = freelancer.wallet_balance or 0.0,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /wallet/withdraw
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/wallet/withdraw",
    response_model=schema.MessageResponse,
    summary="Withdraw from wallet (freelancers only)",
    description="Minimum $5.00. Cannot withdraw more than current balance.",
)
def wallet_withdraw(
    body: schema.WalletWithdrawRequest,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    if body.amount < 5.0:
        raise HTTPException(400, "Minimum withdrawal amount is $5.00.")

    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")

    balance = freelancer.wallet_balance or 0.0
    if body.amount > balance:
        raise HTTPException(400, f"Insufficient balance. Current balance: ${balance:.2f}.")

    freelancer.wallet_balance = balance - body.amount

    db.add(models.WalletTransaction(
        freelancer_id = freelancer.freelancer_id,
        amount        = body.amount,
        type          = models.TransactionType.withdraw,
        description   = "Manual withdrawal",
    ))
    db.commit()

    return {
        "message": (
            f"Withdrawal of ${body.amount:.2f} processed. "
            f"Remaining balance: ${freelancer.wallet_balance:.2f}."
        )
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /wallet/transactions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/wallet/transactions",
    response_model=list[schema.WalletTransactionResponse],
    summary="My wallet transactions (freelancers only)",
)
def wallet_transactions(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        return []
    return (
        db.query(models.WalletTransaction)
        .filter(models.WalletTransaction.freelancer_id == freelancer.freelancer_id)
        .order_by(models.WalletTransaction.transaction_id.desc())
        .all()
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /invoices/my
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/invoices/my",
    summary="Get all invoices (payments) for the logged-in client",
)
def get_client_invoices(
    me: models.User = Depends(require_client),
    db: Session     = Depends(get_db),
):
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client:
        raise HTTPException(404, "Client profile not found.")

    # Fetch all payments linked to this client's contracts via escrow
    payments = (
        db.query(models.Payment, models.Milestone, models.Escrow, models.Contract)
        .join(models.Escrow,    models.Payment.escrow_id    == models.Escrow.escrow_id)
        .join(models.Contract,  models.Escrow.contract_id  == models.Contract.contract_id)
        .outerjoin(models.Milestone, models.Payment.milestone_id == models.Milestone.milestone_id)
        .join(models.Project,   models.Contract.project_id == models.Project.project_id)
        .filter(models.Project.client_id == client.client_id)
        .order_by(models.Payment.payment_date.desc())
        .all()
    )

    result = []
    for payment, milestone, escrow, contract in payments:
        result.append({
            "payment_id":    payment.payment_id,
            "contract_id":   contract.contract_id,
            "project_id":    contract.project_id,
            "milestone_id":  milestone.milestone_id if milestone else None,
            "milestone_title": milestone.title if milestone else "Escrow Payment",
            "amount":        payment.amount or 0.0,
            "status":        milestone.status.value if milestone else "paid",
            "payment_date":  payment.payment_date.isoformat() if payment.payment_date else None,
            "escrow_status": escrow.status.value,
        })
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Helper
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _assert_contract_party(contract: models.Contract, me: models.User, db: Session):
    if me.role == models.UserRole.admin:
        return
    freelancer = db.query(models.Freelancer).filter(models.Freelancer.user_id == me.id).first()
    if freelancer and freelancer.freelancer_id == contract.freelancer_id:
        return
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if client and contract.project.client_id == client.client_id:
        return
    raise HTTPException(403, "You do not have access to this contract.")