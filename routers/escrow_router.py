"""
routers/escrow_router.py — Escrow & Wallet Endpoints
======================================================
POST  /escrow/fund/{contract_id}          → client funds the escrow (simulated payment)
GET   /escrow/{contract_id}               → view escrow status for a contract
POST  /escrow/release/{milestone_id}      → client manually releases funds for a milestone
GET   /wallet/balance                     → freelancer checks wallet balance
POST  /wallet/withdraw                    → freelancer requests a withdrawal
GET   /wallet/transactions                → freelancer views transaction history

NOTE ON PAYMENT INTEGRATION:
  Phase 3 uses a SIMULATED payment flow — no real money moves.
  The fund endpoint accepts a `payment_reference` string (e.g. a PayPal/Stripe
  sandbox transaction ID). In production, you would verify this reference
  with the payment provider's API before marking escrow as funded.

  To integrate Stripe later, replace the simulation block in fund_escrow()
  with a Stripe PaymentIntent verification call.
"""

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

Simulates depositing funds into escrow for a contract.

In a production system this endpoint would verify a real payment with
Stripe or PayPal before marking the escrow as funded.

For now, provide any `payment_reference` string (e.g. `"SANDBOX-12345"`)
and the escrow is marked as `held`.
""",
)
def fund_escrow(
    contract_id:       int,
    body:              schema.EscrowFundRequest,
    me:                models.User = Depends(require_client),
    db:                Session     = Depends(get_db),
):
    contract = db.query(models.Contract).filter(
        models.Contract.contract_id == contract_id
    ).first()
    if not contract:
        raise HTTPException(404, "Contract not found.")

    # Only the contract's client can fund it
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

    # ── SIMULATION: In production, verify payment_reference with Stripe/PayPal here ──
    # Example (Stripe):
    #   import stripe
    #   payment_intent = stripe.PaymentIntent.retrieve(body.payment_reference)
    #   if payment_intent.status != "succeeded":
    #       raise HTTPException(402, "Payment not confirmed by Stripe.")
    # ──────────────────────────────────────────────────────────────────────────────────

    escrow.amount = body.amount if body.amount else escrow.amount
    escrow.status = models.EscrowStatus.held

    db.commit()
    db.refresh(escrow)

    return schema.EscrowResponse(
        escrow_id          = escrow.escrow_id,
        contract_id        = escrow.contract_id,
        amount             = escrow.amount,
        status             = escrow.status,
        payment_reference  = body.payment_reference,
        message            = f"Escrow funded successfully. Reference: {body.payment_reference}",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /escrow/{contract_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/escrow/{contract_id}",
    response_model=schema.EscrowResponse,
    summary="View escrow status",
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

    # Access check
    _assert_contract_party(contract, me, db)

    escrow = db.query(models.Escrow).filter(
        models.Escrow.contract_id == contract_id
    ).first()
    if not escrow:
        raise HTTPException(404, "Escrow not found for this contract.")

    return schema.EscrowResponse(
        escrow_id   = escrow.escrow_id,
        contract_id = escrow.contract_id,
        amount      = escrow.amount,
        status      = escrow.status,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /escrow/release/{milestone_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/escrow/release/{milestone_id}",
    response_model=schema.MessageResponse,
    summary="Release escrow for a milestone",
    description="""
**Client only.**

Manually release the escrow funds for a specific approved milestone.
This credits the freelancer's wallet and marks the milestone as `paid`.

This is an alternative flow to the auto-release that happens when you
update a milestone status to `approved` via `PUT /milestones/{id}/status`.
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

    if milestone.status != models.MilestoneStatus.approved:
        raise HTTPException(
            400,
            "Milestone must be `approved` before funds can be released. "
            "Update the milestone status to 'approved' first."
        )

    # Credit freelancer wallet
    freelancer = contract.freelancer
    freelancer.wallet_balance = (freelancer.wallet_balance or 0) + milestone.amount

    db.add(models.WalletTransaction(
        freelancer_id = freelancer.freelancer_id,
        amount        = milestone.amount,
        type          = models.TransactionType.deposit,
    ))

    escrow = db.query(models.Escrow).filter(
        models.Escrow.contract_id == contract.contract_id
    ).first()
    if escrow:
        db.add(models.Payment(escrow_id=escrow.escrow_id))

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
    summary="Get my wallet balance",
    description="**Freelancers only.** Returns current wallet balance.",
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
    summary="Withdraw from wallet",
    description="""
**Freelancers only.**

Withdraw funds from your wallet (simulated — no real transfer in Phase 3).

Rules:
- Minimum withdrawal: $5.00
- Cannot withdraw more than your current balance
""",
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
        raise HTTPException(
            400,
            f"Insufficient balance. Your current balance is ${balance:.2f}."
        )

    freelancer.wallet_balance = balance - body.amount

    db.add(models.WalletTransaction(
        freelancer_id = freelancer.freelancer_id,
        amount        = body.amount,
        type          = models.TransactionType.withdraw,
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
    summary="My wallet transactions",
    description="**Freelancers only.** Returns all deposits and withdrawals.",
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