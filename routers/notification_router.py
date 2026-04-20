"""
routers/notification_router.py — In-App Notification Endpoints
================================================================
GET    /notifications                   → my notifications (paginated, newest first)
GET    /notifications/unread-count      → fast unread badge count
PATCH  /notifications/read              → mark a list of notification IDs as read
PATCH  /notifications/read-all          → mark ALL my notifications as read
DELETE /notifications/{id}              → delete one notification
DELETE /notifications                   → clear all MY notifications

HOW NOTIFICATIONS ARE CREATED:
  You never create a notification by calling these endpoints.
  The platform creates them automatically when events happen:
    - New proposal on your project
    - Your proposal was accepted or rejected
    - Milestone approved / paid
    - Contract completed or disputed
    - Dispute resolved
    - Verification approved or rejected
    - New chat message
    - Wallet credited

  Every event calls notify() from notification_service.py, which
  persists the row AND pushes it over WebSocket if the user is online.

WEBHOOK STUBS (for frontend polling):
  The GET /notifications endpoint IS the polling endpoint.
  Frontend just calls it every N seconds — no separate webhook needed.
  When the WebSocket is connected, real-time push replaces polling.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db
import models
import schema
from auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /notifications
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "",
    response_model=list[schema.NotificationResponse],
    summary="Get my notifications",
    description="""
Returns your notifications, newest first. Use `unread_only=true` to filter.

This endpoint is safe to poll every 30 seconds as a fallback
when the WebSocket connection is unavailable.

Pagination: default `limit=30`, max `limit=100`.
""",
)
def get_notifications(
    unread_only: bool          = Query(False, description="Return only unread notifications"),
    type_filter: Optional[str] = Query(None,  description="Filter by type: message, proposal, contract, etc."),
    skip:        int           = Query(0,     ge=0),
    limit:       int           = Query(30,    ge=1, le=100),
    me:          models.User   = Depends(get_current_user),
    db:          Session       = Depends(get_db),
):
    q = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == me.id)
    )

    if unread_only:
        q = q.filter(models.Notification.is_read == False)  # noqa: E712

    if type_filter:
        try:
            q = q.filter(models.Notification.type == models.NotificationType(type_filter))
        except ValueError:
            raise HTTPException(
                400,
                f"Unknown type '{type_filter}'. Valid types: "
                "message, proposal, contract, milestone, dispute, "
                "verification, review, payment, system"
            )

    return (
        q.order_by(models.Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /notifications/unread-count
#  NOTE: this MUST be registered before /{notification_id} routes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/unread-count",
    response_model=schema.NotificationSummary,
    summary="Unread notification count (for badge)",
    description="Returns a single integer. Very cheap — safe to call every few seconds.",
)
def get_unread_count(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    count = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == me.id,
            models.Notification.is_read == False,  # noqa: E712
        )
        .count()
    )
    return schema.NotificationSummary(unread_count=count)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /notifications/read  — mark a list as read
#  NOTE: registered before /{notification_id} to avoid route conflict
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/read",
    response_model=schema.MessageResponse,
    summary="Mark specific notifications as read",
    description="Provide a list of `notification_ids` to mark as read. IDs not belonging to you are ignored.",
)
def mark_notifications_read(
    body: schema.NotificationMarkReadRequest,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if not body.notification_ids:
        return {"message": "No IDs provided."}

    updated = (
        db.query(models.Notification)
        .filter(
            models.Notification.notification_id.in_(body.notification_ids),
            models.Notification.user_id == me.id,
            models.Notification.is_read == False,  # noqa: E712
        )
        .update({"is_read": True}, synchronize_session="fetch")
    )
    db.commit()
    return {"message": f"Marked {updated} notification(s) as read."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /notifications/read-all
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/read-all",
    response_model=schema.MessageResponse,
    summary="Mark ALL my notifications as read",
)
def mark_all_read(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    updated = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == me.id,
            models.Notification.is_read == False,  # noqa: E712
        )
        .update({"is_read": True}, synchronize_session="fetch")
    )
    db.commit()
    return {"message": f"Marked {updated} notification(s) as read."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /notifications/{notification_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/{notification_id}",
    response_model=schema.MessageResponse,
    summary="Delete a single notification",
)
def delete_notification(
    notification_id: int,
    me:              models.User = Depends(get_current_user),
    db:              Session     = Depends(get_db),
):
    notif = db.query(models.Notification).filter(
        models.Notification.notification_id == notification_id,
        models.Notification.user_id         == me.id,
    ).first()
    if not notif:
        raise HTTPException(404, "Notification not found.")

    db.delete(notif)
    db.commit()
    return {"message": f"Notification #{notification_id} deleted."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /notifications  — clear all
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "",
    response_model=schema.MessageResponse,
    summary="Clear ALL my notifications",
    description="Permanently deletes every notification for the current user. Cannot be undone.",
)
def clear_all_notifications(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    deleted = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == me.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"message": f"Cleared {deleted} notification(s)."}