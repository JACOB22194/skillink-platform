"""
workers/milestone_worker.py — Background timeout enforcement
=============================================================
Run via run_worker.py as a STANDALONE PROCESS — never attached to the
FastAPI web server lifespan. Attaching to Uvicorn spawns one scheduler per
worker process, causing duplicate DB writes and duplicate notifications.

Concurrency strategy: FOR UPDATE SKIP LOCKED
  - Advisory xact_lock releases on the FIRST db.commit() inside transition(),
    leaving the rest of the batch unprotected. SKIP LOCKED isolates at the
    row level: each worker automatically skips rows being processed by another.
  - Each milestone gets its own isolated session and transaction.

Session management: always use `with SessionLocal() as db:`
  - This guarantees session.close() even on exception, returning the
    connection to the pool. Bare db = SessionLocal() without try/finally
    exhausts the pool and crashes the app.
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

import models
from db import SessionLocal
from services.milestone_state_machine import state_machine
from services.notification_service import notify

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

_BATCH_SIZE = 50   # max milestones processed per job tick


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Job 1: Auto-approve ghosting clients ──────────────────────────────────────

def check_auto_approve() -> None:
    """
    IN_REVIEW milestones where submitted_at > 7 days ago → CLOSED_AUTO_APPROVE.
    Client ghosted; funds automatically released to freelancer.
    """
    cutoff = _utcnow() - timedelta(days=7)

    # Step 1: grab a batch of stale IDs, skipping rows locked by other workers
    with SessionLocal() as db:
        stale_ids = db.scalars(
            select(models.Milestone.milestone_id)
            .where(
                models.Milestone.status == models.MilestoneStatus.in_review,
                models.Milestone.submitted_at < cutoff,
            )
            .with_for_update(skip_locked=True)
            .limit(_BATCH_SIZE)
        ).all()

    if not stale_ids:
        return

    logger.info("auto_approve: processing %d stale milestone(s)", len(stale_ids))

    # Step 2: each milestone in its own isolated transaction
    for m_id in stale_ids:
        with SessionLocal() as db:
            try:
                state_machine.transition(
                    milestone_id=m_id,
                    new_status=models.MilestoneStatus.closed_auto_approve,
                    actor=None,
                    db=db,
                )
                logger.info("auto_approve: milestone %d transitioned", m_id)
            except Exception as exc:
                logger.warning("auto_approve: milestone %d failed — %s", m_id, exc)


# ── Job 2: Auto-refund non-delivering freelancers ─────────────────────────────

def check_auto_refund() -> None:
    """
    FUNDED milestones where deadline has passed by > 5 days and no submission
    → CLOSED_AUTO_REFUND. Freelancer ghosted; funds automatically returned.
    """
    cutoff = _utcnow() - timedelta(days=5)

    with SessionLocal() as db:
        stale_ids = db.scalars(
            select(models.Milestone.milestone_id)
            .where(
                models.Milestone.status == models.MilestoneStatus.funded,
                models.Milestone.submitted_at.is_(None),
                models.Milestone.deadline < cutoff,
            )
            .with_for_update(skip_locked=True)
            .limit(_BATCH_SIZE)
        ).all()

    if not stale_ids:
        return

    logger.info("auto_refund: processing %d overdue milestone(s)", len(stale_ids))

    for m_id in stale_ids:
        with SessionLocal() as db:
            try:
                state_machine.transition(
                    milestone_id=m_id,
                    new_status=models.MilestoneStatus.closed_auto_refund,
                    actor=None,
                    db=db,
                )
                logger.info("auto_refund: milestone %d transitioned", m_id)
            except Exception as exc:
                logger.warning("auto_refund: milestone %d failed — %s", m_id, exc)


# ── Job 3: Stale funding reminders ────────────────────────────────────────────

def check_stale_awaiting_funds() -> None:
    """
    AWAITING_FUNDS milestones created > 48 hours ago.
    No state change — sends a reminder notification to the client.
    """
    cutoff = _utcnow() - timedelta(hours=48)

    with SessionLocal() as db:
        stale = db.scalars(
            select(models.Milestone.milestone_id)
            .where(
                models.Milestone.status == models.MilestoneStatus.awaiting_funds,
                models.Milestone.created_at < cutoff,
            )
            .with_for_update(skip_locked=True)
            .limit(_BATCH_SIZE)
        ).all()

    if not stale:
        return

    logger.info("stale_awaiting: %d unfunded milestone(s) past 48h", len(stale))

    for m_id in stale:
        with SessionLocal() as db:
            try:
                milestone = (
                    db.query(models.Milestone)
                    .join(models.Contract, models.Milestone.contract_id == models.Contract.contract_id)
                    .join(models.Project,  models.Contract.project_id   == models.Project.project_id)
                    .join(models.Client,   models.Project.client_id     == models.Client.client_id)
                    .filter(models.Milestone.milestone_id == m_id)
                    .first()
                )
                if milestone:
                    client_user_id = milestone.contract.project.client.user_id
                    m_title        = milestone.title or f"Milestone #{m_id}"
                    notify(
                        db=db,
                        user_id=client_user_id,
                        type=models.NotificationType.milestone,
                        title="Funding reminder",
                        body=f"'{m_title}' has been waiting for funds for over 48 hours.",
                        entity_id=milestone.contract_id,
                    )
            except Exception as exc:
                logger.warning("stale_awaiting: milestone %d notify failed — %s", m_id, exc)


# ── Scheduler registration ────────────────────────────────────────────────────

scheduler.add_job(check_auto_approve,         "interval", hours=1, id="auto_approve",    misfire_grace_time=300)
scheduler.add_job(check_auto_refund,          "interval", hours=1, id="auto_refund",     misfire_grace_time=300)
scheduler.add_job(check_stale_awaiting_funds, "interval", hours=1, id="stale_awaiting",  misfire_grace_time=300)
