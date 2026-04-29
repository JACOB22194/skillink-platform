"""
subscription_schema.py
=======================
Add this as a new file in your Skilllink-backend directory,
OR append these schemas to your existing schema.py.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class PlanTierSchema(str, Enum):
    free     = "free"
    pro      = "pro"
    business = "business"

class BillingCycleSchema(str, Enum):
    monthly = "monthly"
    yearly  = "yearly"

class SubscriptionStatusSchema(str, Enum):
    active    = "active"
    cancelled = "cancelled"
    expired   = "expired"
    trialing  = "trialing"


# ─── Request Schemas ──────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    """POST /subscriptions/subscribe"""
    plan_tier:     PlanTierSchema
    billing_cycle: Optional[BillingCycleSchema] = None   # required if plan != free
    role_type:     str                                    # "freelancer" or "client"

    class Config:
        use_enum_values = True


class CancelSubscriptionRequest(BaseModel):
    """POST /subscriptions/cancel"""
    reason: Optional[str] = None


# ─── Response Schemas ─────────────────────────────────────────────────────────

class SubscriptionOut(BaseModel):
    subscription_id: int
    user_id:         int
    plan_tier:       str
    billing_cycle:   Optional[str]
    role_type:       str
    status:          str
    started_at:      datetime
    expires_at:      Optional[datetime]
    cancelled_at:    Optional[datetime]
    payment_ref:     Optional[str]

    class Config:
        from_attributes = True


class SubscriptionStatusOut(BaseModel):
    """Lightweight status check — used in dashboard to show upgrade banner."""
    plan_tier:    str
    status:       str
    expires_at:   Optional[datetime]
    is_paid:      bool   # True if plan_tier != "free" and status == "active"

    class Config:
        from_attributes = True