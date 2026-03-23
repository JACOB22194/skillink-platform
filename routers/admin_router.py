"""
routers/admin_router.py — Admin-Only Endpoints
================================================
ALL endpoints here require role = admin.
Any other role automatically gets 403 Forbidden.

GET    /admin/stats                  → platform-wide numbers
GET    /admin/users                  → list every user (with filters)
GET    /admin/users/{id}             → one user's full details
PATCH  /admin/users/{id}/suspend     → suspend a user
PATCH  /admin/users/{id}/activate    → un-suspend a user
POST   /admin/trust-score            → manually set a user's trust score
GET    /admin/logs                   → view system action logs
DELETE /admin/users/{id}             → permanently delete a user
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db
import models
import schema
from auth import require_admin

router = APIRouter(prefix="/admin", tags=["Admin"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/stats
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/stats",
    response_model=schema.AdminStatsResponse,
    summary="Platform statistics",
    description="Total counts for users, freelancers, clients, projects, proposals, and contracts.",
)
def get_stats(
    db:    Session     = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    return schema.AdminStatsResponse(
        total_users       = db.query(models.User).count(),
        total_freelancers = db.query(models.User).filter(
            models.User.role == models.UserRole.freelancer).count(),
        total_clients     = db.query(models.User).filter(
            models.User.role == models.UserRole.client).count(),
        total_projects    = db.query(models.Project).count(),
        total_proposals   = db.query(models.Proposal).count(),
        total_contracts   = db.query(models.Contract).count(),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/users
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/users",
    response_model=list[schema.AdminUserItem],
    summary="List all users",
    description="""
Returns all users. Optional query filters:
- `role` → `freelancer` | `client` | `admin`
- `status` → `active` | `suspended`
- `skip` / `limit` → pagination (default: first 50 users)
""",
)
def list_users(
    role:   Optional[str] = Query(None, description="Filter by role"),
    status: Optional[str] = Query(None, description="Filter by status"),
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(50, ge=1, le=200),
    db:     Session       = Depends(get_db),
    admin:  models.User   = Depends(require_admin),
):
    q = db.query(models.User)

    if role:
        try:
            q = q.filter(models.User.role == models.UserRole(role))
        except ValueError:
            raise HTTPException(400, f"Unknown role '{role}'. Use: freelancer, client, admin")

    if status:
        try:
            q = q.filter(models.User.status == models.UserStatus(status))
        except ValueError:
            raise HTTPException(400, f"Unknown status '{status}'. Use: active, suspended")

    return q.order_by(models.User.created_at.desc()).offset(skip).limit(limit).all()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/users/{user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/users/{user_id}",
    response_model=schema.UserResponse,
    summary="Get any user's full details",
)
def get_user(
    user_id: int,
    db:      Session     = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")
    return user


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /admin/users/{user_id}/suspend
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/users/{user_id}/suspend",
    response_model=schema.MessageResponse,
    summary="Suspend a user",
    description="Sets status to `suspended`. The user cannot log in while suspended.",
)
def suspend_user(
    user_id: int,
    db:      Session     = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot suspend your own account.")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")

    user.status = models.UserStatus.suspended
    db.add(models.SystemLog(
        action       = f"Admin [{admin.email}] suspended user [{user.email}]",
        performed_by = admin.id,
    ))
    db.commit()
    return {"message": f"User '{user.email}' has been suspended."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /admin/users/{user_id}/activate
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/users/{user_id}/activate",
    response_model=schema.MessageResponse,
    summary="Re-activate a suspended user",
)
def activate_user(
    user_id: int,
    db:      Session     = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")

    user.status = models.UserStatus.active
    db.add(models.SystemLog(
        action       = f"Admin [{admin.email}] activated user [{user.email}]",
        performed_by = admin.id,
    ))
    db.commit()
    return {"message": f"User '{user.email}' has been re-activated."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /admin/trust-score
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/trust-score",
    response_model=schema.MessageResponse,
    summary="Set a user's trust score",
    description="Manually set the trust score (0.0 to 100.0). Also writes to trust_scores history.",
)
def set_trust_score(
    body:  schema.AdjustTrustScoreRequest,
    db:    Session     = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")

    db.add(models.TrustScore(user_id=body.user_id, score=body.score))
    db.add(models.SystemLog(
        action       = f"Admin [{admin.email}] set trust score {body.score} for [{user.email}]",
        performed_by = admin.id,
    ))
    db.commit()
    return {"message": f"Trust score for '{user.email}' set to {body.score}."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /admin/logs
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/logs",
    summary="View system logs",
    description="Returns recent system log entries, newest first. Default: last 100.",
)
def get_logs(
    skip:  int     = Query(0,   ge=0),
    limit: int     = Query(100, ge=1, le=500),
    db:    Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    logs = (
        db.query(models.SystemLog)
        .order_by(models.SystemLog.timestamp.desc())
        .offset(skip).limit(limit)
        .all()
    )
    return [
        {
            "log_id":       log.log_id,
            "action":       log.action,
            "performed_by": log.performed_by,
            "timestamp":    log.timestamp,
        }
        for log in logs
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /admin/users/{user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/users/{user_id}",
    response_model=schema.MessageResponse,
    summary="Permanently delete a user",
    description="Hard-deletes the user and all their data. Cannot be undone.",
)
def delete_user(
    user_id: int,
    db:      Session     = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot delete your own admin account.")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")

    db.delete(user)
    db.commit()
    return {"message": f"User '{user.email}' has been permanently deleted."}