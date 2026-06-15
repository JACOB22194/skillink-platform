"""
services/milestone_state_machine.py — Strict escrow state machine
==================================================================
All business logic for milestone state transitions lives here.
Routers are dumb: they parse requests and delegate here.

Locking order (prevents deadlocks with wallet/withdrawal endpoints):
  Freelancer → Escrow → Milestone   (Parent → Child)

Post-commit notification rule:
  Notification fields are extracted into local vars BEFORE db.commit().
  notify() is called strictly AFTER commit succeeds.
  This prevents DetachedInstanceError and avoids notifying on rollback.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

import models
from services.notification_service import notify

logger = logging.getLogger(__name__)

# ── Terminal states — no outbound transitions allowed ─────────────────────────
_TERMINAL = {
    models.MilestoneStatus.closed_success,
    models.MilestoneStatus.closed_refunded,
    models.MilestoneStatus.closed_auto_approve,
    models.MilestoneStatus.closed_auto_refund,
}

# ── States that belong to the new escrow state machine ───────────────────────
NEW_STYLE_STATUSES = {
    models.MilestoneStatus.awaiting_funds,
    models.MilestoneStatus.funded,
    models.MilestoneStatus.in_review,
    models.MilestoneStatus.in_revision,
    models.MilestoneStatus.in_dispute,
    models.MilestoneStatus.closed_success,
    models.MilestoneStatus.closed_refunded,
    models.MilestoneStatus.closed_auto_approve,
    models.MilestoneStatus.closed_auto_refund,
}

# ── Allowed transition map ────────────────────────────────────────────────────
_ALLOWED: dict[models.MilestoneStatus, list[models.MilestoneStatus]] = {
    models.MilestoneStatus.awaiting_funds: [
        models.MilestoneStatus.funded,
    ],
    models.MilestoneStatus.funded: [
        models.MilestoneStatus.in_review,
        models.MilestoneStatus.closed_auto_refund,
    ],
    models.MilestoneStatus.in_review: [
        models.MilestoneStatus.in_revision,
        models.MilestoneStatus.closed_success,
        models.MilestoneStatus.in_dispute,
        models.MilestoneStatus.closed_auto_approve,
        models.MilestoneStatus.closed_refunded,
    ],
    models.MilestoneStatus.in_revision: [
        models.MilestoneStatus.in_review,
        models.MilestoneStatus.in_dispute,
    ],
    models.MilestoneStatus.in_dispute: [
        models.MilestoneStatus.closed_success,
        models.MilestoneStatus.closed_refunded,
    ],
}
for _t in _TERMINAL:
    _ALLOWED[_t] = []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _assert_actor(
    milestone: models.Milestone,
    new_status: models.MilestoneStatus,
    actor: models.User | None,
    db: Session,
) -> None:
    """Raise 403 if the actor is not authorised to trigger this transition."""

    # Worker-triggered auto transitions — actor must be None
    if new_status in (
        models.MilestoneStatus.closed_auto_approve,
        models.MilestoneStatus.closed_auto_refund,
    ):
        if actor is not None:
            raise HTTPException(403, "This transition is only triggered by the background worker.")
        return

    if actor is None:
        raise HTTPException(403, "Actor required for this transition.")

    contract = milestone.contract

    if new_status == models.MilestoneStatus.funded:
        # Only the client who owns the contract
        client = db.query(models.Client).filter(models.Client.user_id == actor.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "Only the client can fund a milestone.")

    elif new_status == models.MilestoneStatus.in_review:
        # Only the freelancer on this contract
        freelancer = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == actor.id
        ).first()
        if not freelancer or freelancer.freelancer_id != contract.freelancer_id:
            raise HTTPException(403, "Only the freelancer can submit work.")

    elif new_status in (models.MilestoneStatus.in_revision, models.MilestoneStatus.closed_refunded):
        # Client-initiated rejection/refund
        if actor.role == models.UserRole.admin:
            return
        client = db.query(models.Client).filter(models.Client.user_id == actor.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "Only the client can reject or refund a milestone.")

    elif new_status == models.MilestoneStatus.in_dispute:
        # Either party can escalate
        freelancer = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == actor.id
        ).first()
        client = db.query(models.Client).filter(models.Client.user_id == actor.id).first()
        is_party = (
            (freelancer and freelancer.freelancer_id == contract.freelancer_id)
            or (client and contract.project.client_id == client.client_id)
            or actor.role == models.UserRole.admin
        )
        if not is_party:
            raise HTTPException(403, "Only a contract party can escalate to dispute.")

    elif new_status == models.MilestoneStatus.closed_success:
        # Client approve OR admin force-pay
        if actor.role == models.UserRole.admin:
            return
        client = db.query(models.Client).filter(models.Client.user_id == actor.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "Only the client or an admin can approve a milestone.")


def _release_funds(
    milestone: models.Milestone,
    freelancer: models.Freelancer,
    escrow: models.Escrow,
    db: Session,
    admin_actor: models.User | None = None,
) -> None:
    """Credit the freelancer wallet, update escrow, write EscrowTransaction + WalletTransaction."""
    amount = Decimal(str(milestone.amount or 0))

    freelancer.wallet_balance = float(
        Decimal(str(freelancer.wallet_balance or 0)) + amount
    )

    db.add(models.WalletTransaction(
        freelancer_id=freelancer.freelancer_id,
        amount=float(amount),
        type=models.TransactionType.deposit,
        description=(
            f"Milestone #{milestone.milestone_id} approved — ${float(amount):.2f}"
        ),
    ))

    escrow.released_amount = float(
        Decimal(str(escrow.released_amount or 0)) + amount
    )

    db.add(models.EscrowTransaction(
        escrow_id=escrow.escrow_id,
        milestone_id=milestone.milestone_id,
        type=models.EscrowTransactionType.release,
        amount=amount,
        note="Funds released to freelancer",
    ))

    db.add(models.SystemLog(
        action=(
            f"Funds released: milestone #{milestone.milestone_id} "
            f"${float(amount):.2f} → freelancer #{freelancer.freelancer_id}"
            + (f" (admin: {admin_actor.id})" if admin_actor else "")
        ),
        performed_by=admin_actor.id if admin_actor else None,
    ))


def _refund_funds(
    milestone: models.Milestone,
    escrow: models.Escrow,
    db: Session,
    admin_actor: models.User | None = None,
    note: str = "Funds refunded to client",
) -> None:
    """Record a refund EscrowTransaction (actual money movement handled by payment gateway)."""
    amount = Decimal(str(milestone.amount or 0))

    db.add(models.EscrowTransaction(
        escrow_id=escrow.escrow_id,
        milestone_id=milestone.milestone_id,
        type=models.EscrowTransactionType.refund,
        amount=amount,
        note=note,
    ))

    db.add(models.SystemLog(
        action=(
            f"Refund recorded: milestone #{milestone.milestone_id} "
            f"${float(amount):.2f}"
            + (f" (admin: {admin_actor.id})" if admin_actor else " (auto)")
        ),
        performed_by=admin_actor.id if admin_actor else None,
    ))


def _activate_next_milestone(milestone: models.Milestone, db: Session) -> None:
    """Set the next AWAITING_FUNDS milestone on the same contract to FUNDED (if escrow allows)."""
    siblings = (
        db.query(models.Milestone)
        .filter(
            models.Milestone.contract_id == milestone.contract_id,
            models.Milestone.milestone_id != milestone.milestone_id,
            models.Milestone.status == models.MilestoneStatus.awaiting_funds,
        )
        .order_by(models.Milestone.created_at)
        .first()
    )
    if siblings:
        # Leave as AWAITING_FUNDS — client must manually fund the next milestone
        # (we do not auto-debit; that would require a separate payment action)
        pass


class MilestoneStateMachine:
    """
    Owns all state transitions for new-style (escrow) milestones.

    Call transition() for every state change — it validates the transition,
    acquires the correct row locks in Parent-to-Child order, executes side
    effects, commits once, then fires post-commit notifications.
    """

    def transition(
        self,
        milestone_id: int,
        new_status: models.MilestoneStatus,
        actor: models.User | None,
        db: Session,
        feedback: str | None = None,
        idempotency_key: str | None = None,
    ) -> models.Milestone:
        """
        Execute a validated state transition.

        Args:
            milestone_id:     PK of the milestone to transition.
            new_status:       Target status.
            actor:            The user performing the action; None for worker jobs.
            db:               SQLAlchemy session — this function owns the commit.
            feedback:         Required for in_revision transitions.
            idempotency_key:  UUID from frontend; saved atomically with the state change.
        """
        is_money_transition = new_status in (
            models.MilestoneStatus.closed_success,
            models.MilestoneStatus.closed_auto_approve,
            models.MilestoneStatus.closed_refunded,
            models.MilestoneStatus.closed_auto_refund,
        )

        # ── Step 1: unlocked read to resolve parent IDs ───────────────────────
        meta = (
            db.query(
                models.Milestone.escrow_transaction_id,
                models.Contract.freelancer_id,
                models.Contract.contract_id,
                models.Contract.project_id,
            )
            .join(models.Contract, models.Milestone.contract_id == models.Contract.contract_id)
            .filter(models.Milestone.milestone_id == milestone_id)
            .first()
        )
        if not meta:
            raise HTTPException(404, "Milestone not found.")

        # ── Step 2: Parent-to-Child row locks for money transitions ──────────
        # Lock Freelancer first, then Escrow, then Milestone.
        # This order MUST match the withdrawal endpoint's lock order to prevent deadlocks.
        freelancer: models.Freelancer | None = None
        escrow: models.Escrow | None = None

        if is_money_transition:
            freelancer = (
                db.query(models.Freelancer)
                .with_for_update()
                .filter(models.Freelancer.freelancer_id == meta.freelancer_id)
                .first()
            )
            if not freelancer:
                raise HTTPException(404, "Freelancer record not found.")

            escrow = (
                db.query(models.Escrow)
                .with_for_update()
                .filter(models.Escrow.contract_id == meta.contract_id)
                .first()
            )
            if not escrow:
                raise HTTPException(404, "Escrow record not found.")

        # ── Step 3: Lock Milestone for update ─────────────────────────────────
        milestone = (
            db.query(models.Milestone)
            .with_for_update()
            .filter(models.Milestone.milestone_id == milestone_id)
            .first()
        )
        if not milestone:
            raise HTTPException(404, "Milestone not found.")

        # ── Step 4: validate transition ───────────────────────────────────────
        current = milestone.status
        if new_status not in _ALLOWED.get(current, []):
            raise HTTPException(
                400,
                f"Invalid transition: {current.value} → {new_status.value}. "
                f"Allowed from {current.value}: "
                f"{[s.value for s in _ALLOWED.get(current, [])]}",
            )

        # Revision cap: at in_review → in_revision, if already at limit → block
        if (
            current == models.MilestoneStatus.in_review
            and new_status == models.MilestoneStatus.in_revision
            and milestone.revision_count >= 2
        ):
            raise HTTPException(
                400,
                "Maximum revisions (2) reached. Use /escalate to open a dispute instead.",
            )

        # ── Step 5: actor authorisation ───────────────────────────────────────
        _assert_actor(milestone, new_status, actor, db)

        # ── Step 6: Extract notification fields BEFORE commit ─────────────────
        # After commit the ORM objects are detached; lazy loads raise DetachedInstanceError.
        freelancer_user_id = milestone.contract.freelancer.user_id
        client_user_id     = milestone.contract.project.client.user_id
        contract_id        = milestone.contract_id
        m_title            = milestone.title or f"Milestone #{milestone_id}"

        # ── Step 7: mutate state + side effects (all in one transaction) ──────
        milestone.status = new_status

        if new_status == models.MilestoneStatus.funded:
            milestone.funded_at = _now()
            db.add(models.EscrowTransaction(
                escrow_id=escrow.escrow_id if escrow else (
                    db.query(models.Escrow.escrow_id)
                    .filter(models.Escrow.contract_id == milestone.contract_id)
                    .scalar()
                ),
                milestone_id=milestone_id,
                type=models.EscrowTransactionType.fund,
                amount=Decimal(str(milestone.amount or 0)),
                note="Milestone funded by client",
            ))

        elif new_status == models.MilestoneStatus.in_review:
            milestone.submitted_at = _now()

        elif new_status == models.MilestoneStatus.in_revision:
            if not feedback:
                raise HTTPException(400, "Feedback is required when requesting revision.")
            milestone.revision_count   += 1
            milestone.revision_feedback = feedback

        elif new_status == models.MilestoneStatus.in_review and current == models.MilestoneStatus.in_revision:
            # Freelancer resubmitting after revision — clear the feedback
            milestone.revision_feedback = None

        elif new_status in (
            models.MilestoneStatus.closed_success,
            models.MilestoneStatus.closed_auto_approve,
        ):
            _release_funds(
                milestone, freelancer, escrow, db,
                admin_actor=actor if (actor and actor.role == models.UserRole.admin) else None,
            )

        elif new_status in (
            models.MilestoneStatus.closed_refunded,
            models.MilestoneStatus.closed_auto_refund,
        ):
            _refund_funds(
                milestone, escrow, db,
                admin_actor=actor if (actor and actor.role == models.UserRole.admin) else None,
            )

        # Save idempotency key atomically with the state change
        if idempotency_key:
            db.add(models.IdempotencyLog(key=idempotency_key, action=f"milestone_{new_status.value}"))

        # ── Step 8: commit — all or nothing ──────────────────────────────────
        try:
            db.commit()
            db.refresh(milestone)
        except Exception as exc:
            db.rollback()
            logger.error("State transition failed for milestone %s: %s", milestone_id, exc)
            raise HTTPException(500, "State transition failed. Please try again.")

        # ── Step 9: post-commit notifications (use pre-extracted IDs) ─────────
        self._notify_transition(
            db=db,
            new_status=new_status,
            contract_id=contract_id,
            freelancer_user_id=freelancer_user_id,
            client_user_id=client_user_id,
            m_title=m_title,
        )

        return milestone

    def _notify_transition(
        self,
        db: Session,
        new_status: models.MilestoneStatus,
        contract_id: int,
        freelancer_user_id: int,
        client_user_id: int,
        m_title: str,
    ) -> None:
        """Fire post-commit notifications using pre-extracted user IDs."""
        try:
            if new_status == models.MilestoneStatus.funded:
                notify(
                    db=db, user_id=freelancer_user_id,
                    type=models.NotificationType.milestone,
                    title="Milestone funded — work is unlocked",
                    body=f"'{m_title}' has been funded. You can now submit your work.",
                    entity_id=contract_id,
                )
            elif new_status == models.MilestoneStatus.in_review:
                notify(
                    db=db, user_id=client_user_id,
                    type=models.NotificationType.milestone,
                    title="Work submitted for review",
                    body=f"The freelancer submitted work on '{m_title}'. Please review.",
                    entity_id=contract_id,
                )
            elif new_status == models.MilestoneStatus.in_revision:
                notify(
                    db=db, user_id=freelancer_user_id,
                    type=models.NotificationType.milestone,
                    title="Revision requested",
                    body=f"The client requested a revision on '{m_title}'.",
                    entity_id=contract_id,
                )
            elif new_status == models.MilestoneStatus.in_review and True:
                pass  # resubmit → client notified via the same in_review path above
            elif new_status == models.MilestoneStatus.in_dispute:
                notify(
                    db=db, user_id=freelancer_user_id,
                    type=models.NotificationType.dispute,
                    title="Milestone escalated to dispute",
                    body=f"'{m_title}' is now in dispute awaiting admin review.",
                    entity_id=contract_id,
                )
                notify(
                    db=db, user_id=client_user_id,
                    type=models.NotificationType.dispute,
                    title="Milestone escalated to dispute",
                    body=f"'{m_title}' is now in dispute awaiting admin review.",
                    entity_id=contract_id,
                )
            elif new_status in (
                models.MilestoneStatus.closed_success,
                models.MilestoneStatus.closed_auto_approve,
            ):
                notify(
                    db=db, user_id=freelancer_user_id,
                    type=models.NotificationType.payment,
                    title="Funds released to your wallet",
                    body=f"'{m_title}' was approved. Funds have been credited.",
                    entity_id=contract_id,
                )
            elif new_status in (
                models.MilestoneStatus.closed_refunded,
                models.MilestoneStatus.closed_auto_refund,
            ):
                notify(
                    db=db, user_id=client_user_id,
                    type=models.NotificationType.payment,
                    title="Milestone refunded",
                    body=f"Funds for '{m_title}' have been returned to you.",
                    entity_id=contract_id,
                )
                notify(
                    db=db, user_id=freelancer_user_id,
                    type=models.NotificationType.milestone,
                    title="Milestone refunded to client",
                    body=f"'{m_title}' was refunded to the client.",
                    entity_id=contract_id,
                )
        except Exception as exc:
            # Notification failure must never roll back the committed state change.
            logger.warning("Post-commit notification failed for contract %s: %s", contract_id, exc)

    def resolve_arbitration(
        self,
        milestone_id: int,
        resolution_type: str,
        split_percentage: float | None,
        actor: models.User,
        db: Session,
        note: str | None = None,
        idempotency_key: str | None = None,
    ) -> models.Milestone:
        """
        Admin-only dispute resolution.
        All math and DB writes happen here — zero logic in the router.

        resolution_type:
          "force_pay"    → transition to closed_success (full release to freelancer)
          "force_refund" → transition to closed_refunded (full refund to client)
          "split"        → partial release + partial refund by split_percentage
        """
        if actor.role != models.UserRole.admin:
            raise HTTPException(403, "Only admins can resolve disputes.")

        if resolution_type == "force_pay":
            return self.transition(
                milestone_id=milestone_id,
                new_status=models.MilestoneStatus.closed_success,
                actor=actor,
                db=db,
                idempotency_key=idempotency_key,
            )

        if resolution_type == "force_refund":
            return self.transition(
                milestone_id=milestone_id,
                new_status=models.MilestoneStatus.closed_refunded,
                actor=actor,
                db=db,
                idempotency_key=idempotency_key,
            )

        if resolution_type == "split":
            if split_percentage is None or not (0 < split_percentage < 100):
                raise HTTPException(400, "split_percentage must be between 0 and 100 (exclusive).")

            # Resolve parent IDs (unlocked read)
            meta = (
                db.query(
                    models.Contract.freelancer_id,
                    models.Contract.contract_id,
                )
                .join(models.Milestone, models.Milestone.contract_id == models.Contract.contract_id)
                .filter(models.Milestone.milestone_id == milestone_id)
                .first()
            )
            if not meta:
                raise HTTPException(404, "Milestone not found.")

            # Parent-to-Child locking
            freelancer = (
                db.query(models.Freelancer)
                .with_for_update()
                .filter(models.Freelancer.freelancer_id == meta.freelancer_id)
                .first()
            )
            escrow = (
                db.query(models.Escrow)
                .with_for_update()
                .filter(models.Escrow.contract_id == meta.contract_id)
                .first()
            )
            milestone = (
                db.query(models.Milestone)
                .with_for_update()
                .filter(models.Milestone.milestone_id == milestone_id)
                .first()
            )
            if not milestone:
                raise HTTPException(404, "Milestone not found.")

            if milestone.status != models.MilestoneStatus.in_dispute:
                raise HTTPException(400, "Can only split an in_dispute milestone.")

            total = Decimal(str(milestone.amount or 0))
            freelancer_share = (total * Decimal(str(split_percentage)) / 100).quantize(
                Decimal("0.01")
            )
            client_refund = total - freelancer_share

            # Extract notification fields before commit
            freelancer_user_id = milestone.contract.freelancer.user_id
            client_user_id     = milestone.contract.project.client.user_id
            contract_id        = milestone.contract_id
            m_title            = milestone.title or f"Milestone #{milestone_id}"

            # Credit freelancer
            freelancer.wallet_balance = float(
                Decimal(str(freelancer.wallet_balance or 0)) + freelancer_share
            )
            db.add(models.WalletTransaction(
                freelancer_id=freelancer.freelancer_id,
                amount=float(freelancer_share),
                type=models.TransactionType.deposit,
                description=f"Split arbitration: milestone #{milestone_id} ({split_percentage}%)",
            ))

            escrow.released_amount = float(
                Decimal(str(escrow.released_amount or 0)) + freelancer_share
            )
            db.add(models.EscrowTransaction(
                escrow_id=escrow.escrow_id,
                milestone_id=milestone_id,
                type=models.EscrowTransactionType.release,
                amount=freelancer_share,
                note=f"Split {split_percentage}% to freelancer",
            ))
            db.add(models.EscrowTransaction(
                escrow_id=escrow.escrow_id,
                milestone_id=milestone_id,
                type=models.EscrowTransactionType.refund,
                amount=client_refund,
                note=f"Split {100 - split_percentage}% refunded to client",
            ))

            db.add(models.SystemLog(
                action=(
                    f"Admin split arbitration: milestone #{milestone_id} "
                    f"{split_percentage}% (${float(freelancer_share):.2f}) to freelancer, "
                    f"{100-split_percentage}% (${float(client_refund):.2f}) refunded to client. "
                    + (f"Note: {note}" if note else "")
                ),
                performed_by=actor.id,
            ))

            milestone.status = models.MilestoneStatus.closed_success

            if idempotency_key:
                db.add(models.IdempotencyLog(key=idempotency_key, action="milestone_split"))

            try:
                db.commit()
                db.refresh(milestone)
            except Exception as exc:
                db.rollback()
                logger.error("Split arbitration failed for milestone %s: %s", milestone_id, exc)
                raise HTTPException(500, "Split arbitration failed. Please try again.")

            # Post-commit notifications
            try:
                notify(
                    db=db, user_id=freelancer_user_id,
                    type=models.NotificationType.payment,
                    title="Dispute resolved — partial payment",
                    body=f"Admin split '{m_title}': ${float(freelancer_share):.2f} credited to you.",
                    entity_id=contract_id,
                )
                notify(
                    db=db, user_id=client_user_id,
                    type=models.NotificationType.payment,
                    title="Dispute resolved — partial refund",
                    body=f"Admin split '{m_title}': ${float(client_refund):.2f} refunded to you.",
                    entity_id=contract_id,
                )
            except Exception as exc:
                logger.warning("Post-split notification failed: %s", exc)

            return milestone

        raise HTTPException(400, "Invalid resolution type.")


# Module-level singleton
state_machine = MilestoneStateMachine()
