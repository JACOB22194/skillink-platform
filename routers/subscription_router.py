"""
routers/subscription_router.py
================================
Handles plan subscriptions — subscribe, cancel, status check.

Register in main.py:
    from routers.subscription_router import router as subscription_router
    app.include_router(subscription_router)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from db import get_db
from auth import get_current_user
import models

# Import schemas — adjust path if you merged into schema.py
from subscription_schema import (
    SubscribeRequest,
    CancelSubscriptionRequest,
    SubscriptionOut,
    SubscriptionStatusOut,
)

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

PLAN_PRICES = {
    ("pro",      "monthly"): 19,
    ("pro",      "yearly"):  15,   # per month, billed yearly
    ("business", "monthly"): 49,
    ("business", "yearly"):  39,
}

def _calc_expiry(billing_cycle: str | None) -> datetime | None:
    """Return when this subscription expires. Free plans never expire."""
    if billing_cycle == "monthly":
        return datetime.now(timezone.utc) + timedelta(days=30)
    if billing_cycle == "yearly":
        return datetime.now(timezone.utc) + timedelta(days=365)
    return None  # free


def _get_or_create_subscription(db: Session, user_id: int) -> models.Subscription:
    sub = db.query(models.Subscription).filter_by(user_id=user_id).first()
    if not sub:
        sub = models.Subscription(
            user_id=user_id,
            plan_tier="free",
            status="active",
            role_type="freelancer",
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return sub


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/subscribe", response_model=SubscriptionOut, status_code=status.HTTP_200_OK)
def subscribe(
    payload: SubscribeRequest,
    db:      Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Subscribe to a plan or upgrade/downgrade.
    For a real integration, charge via Stripe here before updating the DB.
    """
    if payload.plan_tier != "free" and not payload.billing_cycle:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="billing_cycle is required for paid plans.",
        )

    sub = _get_or_create_subscription(db, current_user.id)

    sub.plan_tier     = payload.plan_tier
    sub.billing_cycle = payload.billing_cycle
    sub.role_type     = payload.role_type
    sub.status        = "active"
    sub.started_at    = datetime.now(timezone.utc)
    sub.expires_at    = _calc_expiry(payload.billing_cycle)
    sub.cancelled_at  = None
    sub.updated_at    = datetime.now(timezone.utc)

    db.commit()
    db.refresh(sub)
    return sub


@router.get("/status", response_model=SubscriptionStatusOut)
def get_subscription_status(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns the current user's plan tier and status.
    Dashboards call this to decide whether to show the upgrade banner.
    """
    sub = _get_or_create_subscription(db, current_user.id)

    # Auto-expire if past expiry date
    if sub.expires_at and sub.expires_at < datetime.now(timezone.utc) and sub.status == "active":
        sub.status = "expired"
        sub.plan_tier = "free"
        db.commit()
        db.refresh(sub)

    return SubscriptionStatusOut(
        plan_tier=sub.plan_tier,
        status=sub.status,
        expires_at=sub.expires_at,
        is_paid=(sub.plan_tier != "free" and sub.status == "active"),
    )


@router.get("/me", response_model=SubscriptionOut)
def get_my_subscription(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Full subscription details for the settings/billing page."""
    sub = _get_or_create_subscription(db, current_user.id)
    return sub


@router.post("/cancel", response_model=SubscriptionOut)
def cancel_subscription(
    payload: CancelSubscriptionRequest,
    db:      Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Cancel the active subscription. Access continues until expires_at."""
    sub = db.query(models.Subscription).filter_by(user_id=current_user.id).first()
    if not sub or sub.plan_tier == "free":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active paid subscription to cancel.",
        )

    sub.status       = "cancelled"
    sub.cancelled_at = datetime.now(timezone.utc)
    sub.updated_at   = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return sub