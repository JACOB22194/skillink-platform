"""
main.py — Application Entry Point
====================================
Phase 5 Update:
  - Registered: messaging_router  (REST messaging + WebSocket /ws/chat)
  - Registered: notification_router (GET/PATCH/DELETE /notifications)
  - Removed: messaging section from ai_router (now in messaging_router)
  - notify() integrated throughout: proposals, contracts, disputes, verification

ARCHITECTURE SUMMARY:
  notification_service.py   — central notify() function + WebSocket manager singleton
  routers/messaging_router.py   — /messages/* REST + WS /ws/chat
  routers/notification_router.py — /notifications/* REST

WebSocket endpoint: WS /ws/chat?token=<access_token>
"""

import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from db import engine, SessionLocal
import models
from routers.auth_router         import router as auth_router
from routers.user_router         import router as user_router
from routers.user_router         import freelancer_router
from routers.admin_router        import router as admin_router
from routers.project_router      import router as project_router
from routers.proposal_router     import router as proposal_router
from routers.contract_router     import router as contract_router
from routers.escrow_router       import router as escrow_router
from routers.file_router         import router as file_router
from routers.ai_router           import router as ai_router
from routers.messaging_router    import router as messaging_router
from routers.notification_router import router as notification_router
from routers.github_router       import router as github_router
from routers.recommend_router    import router as recommend_router
from routers.subscription_router import router as subscription_router
from routers.launchpad_router    import router as launchpad_router
from routers.skill_growth_router import router as skill_growth_router
from routers.internal_router    import router as internal_router

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    retries = 30
    for attempt in range(1, retries + 1):
        try:
            models.Base.metadata.create_all(bind=engine)
            logging.info("✅ Database tables created / verified successfully.")
            break
        except OperationalError as exc:
            logging.warning(
                "⏳ Database not ready yet (attempt %s/%s). Retrying in 1s...\n   Error: %s",
                attempt, retries, exc,
            )
            time.sleep(1)
    else:
        raise RuntimeError("❌ Could not connect to the database after 30 retries.")

    # ── Seed default role configs (ADM-01) ────────────────────────────────
    _db = SessionLocal()
    try:
        _default_roles = [
            {
                "role_name":    "freelancer",
                "display_name": "Freelancer",
                "description":  "Independent contractors who bid on projects and deliver work.",
                "permissions":  json.dumps(["submit_proposals", "view_projects", "manage_milestones", "withdraw_wallet", "view_ai_matches"]),
            },
            {
                "role_name":    "client",
                "display_name": "Client",
                "description":  "Businesses and individuals who post projects and hire talent.",
                "permissions":  json.dumps(["post_projects", "accept_proposals", "fund_escrow", "open_disputes", "review_freelancers"]),
            },
            {
                "role_name":    "admin",
                "display_name": "Administrator",
                "description":  "Platform administrators with full access to all management functions.",
                "permissions":  json.dumps(["manage_users", "manage_roles", "resolve_disputes", "view_analytics", "configure_ai", "manage_verifications"]),
            },
        ]
        for _rd in _default_roles:
            if not _db.query(models.RoleConfig).filter(models.RoleConfig.role_name == _rd["role_name"]).first():
                _db.add(models.RoleConfig(**_rd))
        _db.commit()
        logging.info("✅ Role configs seeded.")
    except Exception as _e:
        logging.warning("⚠️  Could not seed role configs: %s", _e)
    finally:
        _db.close()

    yield
    logging.info("SkillLink API shutting down.")


app = FastAPI(
    lifespan    = lifespan,
    title       = "SkillLink API",
    version     = "4.0.0",
    description = """
## SkillLink — AI-Powered Freelance Platform

### Phase 5: Messaging, WebSocket Chat & Notifications

**Authentication**
- `POST /auth/register` — Create account
- `POST /auth/login` — Login + JWT tokens
- `POST /auth/refresh` — Refresh access token
- `POST /auth/mfa/setup` — Enable/disable MFA
- `POST /auth/mfa/verify` — Confirm MFA setup
- `POST /auth/verify-mfa` — Complete MFA login
- `POST /auth/change-password` — Change password

**Projects**
- `POST /projects` — Create project *(client)*
- `GET /projects` — Browse open projects
- `GET /projects/my` — My projects
- `GET /projects/{id}` — View one project
- `PUT /projects/{id}` — Edit project *(owner)*
- `DELETE /projects/{id}` — Delete project *(owner/admin)*

**AI Features**
- `GET /projects/{id}/ai-match` — AI-ranked freelancers
- `POST /projects/{id}/ai-pricing` — AI-suggested budget
- `POST /proposals/{id}/score` — AI relevance score

**Proposals**
- `POST /proposals` — Submit proposal *(freelancer)*
- `GET /proposals/project/{id}` — Proposals for a project *(owner)*
- `GET /proposals/my` — My proposals *(freelancer)*
- `PUT /proposals/{id}/status` — Accept or reject *(client)*
- `DELETE /proposals/{id}` — Withdraw *(freelancer)*

**Contracts & Milestones**
- `GET /contracts/my` — My contracts
- `GET /contracts/{id}` — View a contract
- `POST /contracts/{id}/milestones` — Add milestone *(client)*
- `GET /contracts/{id}/milestones` — List milestones
- `PUT /milestones/{id}/status` — Approve/pay milestone
- `POST /contracts/{id}/complete` — Complete contract *(client)*
- `POST /contracts/{id}/dispute` — Open dispute
- `POST /contracts/{id}/review` — Submit review
- `GET /contracts/{id}/review` — Get review

**Escrow & Wallet**
- `POST /escrow/fund/{contract_id}` — Fund escrow *(client)*
- `GET /escrow/{contract_id}` — Check escrow status
- `POST /escrow/release/{milestone_id}` — Release milestone funds
- `GET /wallet/balance` — My balance *(freelancer)*
- `POST /wallet/withdraw` — Withdraw funds *(freelancer)*
- `GET /wallet/transactions` — Transaction history *(freelancer)*

**Files**
- `POST /files/upload/{project_id}` — Upload file
- `GET /files/project/{project_id}` — List project files
- `GET /files/{id}` — File metadata
- `DELETE /files/{id}` — Delete file

**Users & Profiles**
- `GET /users/me` — My account info
- `GET /users/me/profile` — My profile
- `PUT /users/me/profile` — Edit profile
- `POST /users/me/portfolio` — Upload portfolio *(freelancer)*
- `POST /users/me/skills` — Add skills
- `DELETE /users/me/skills` — Remove skills
- `GET /freelancers/search` — Search freelancers
- `GET /users/{id}` — View any user

**Disputes**
- `GET /admin/disputes` — List all disputes
- `GET /admin/disputes/{id}` — Get one dispute
- `POST /admin/disputes/{id}/resolve` — Resolve dispute

**Verification**
- `POST /verification/submit` — Submit identity document
- `GET /verification/status` — My verification status
- `GET /admin/verification` — All verifications *(admin)*
- `PATCH /admin/verification/{id}` — Approve/reject *(admin)*

**Messaging ✅ Phase 5**
- `POST /messages` — Send a message
- `GET /messages/inbox` — Inbox (grouped by partner)
- `GET /messages/unread-count` — Unread message count
- `GET /messages/{user_id}` — Full conversation
- `PATCH /messages/{user_id}/read` — Mark as read
- `DELETE /messages/{message_id}` — Delete a message

**WebSocket ✅ Phase 5**
- `WS /ws/chat?token=<access_token>` — Real-time bidirectional chat

**Notifications ✅ Phase 5**
- `GET /notifications` — My notifications
- `GET /notifications/unread-count` — Unread badge count
- `PATCH /notifications/read` — Mark specific IDs as read
- `PATCH /notifications/read-all` — Mark all as read
- `DELETE /notifications/{id}` — Delete one notification
- `DELETE /notifications` — Clear all my notifications

**Admin**
- `GET /admin/stats` — Platform statistics
- `GET /admin/users` — List all users
- `GET /admin/users/{id}` — User details
- `PATCH /admin/users/{id}/suspend` — Suspend user
- `PATCH /admin/users/{id}/activate` — Activate user
- `POST /admin/trust-score` — Set trust score
- `GET /admin/logs` — System logs
- `DELETE /admin/users/{id}` — Delete user

---
### Authenticate: Register → Login → copy `access_token` → click **Authorize** → paste token

### WebSocket Testing
Use any WS client (e.g. [websocat](https://github.com/vi/websocat)):
```
websocat "ws://localhost:8000/ws/chat?token=YOUR_ACCESS_TOKEN"
{"type": "ping"}
{"type": "chat_message", "payload": {"receiver_id": 2, "content": "Hello!"}}
```
""",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # In production: specify your frontend URL
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Static uploads ────────────────────────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(freelancer_router)       # GET /freelancers/search
app.include_router(admin_router)
app.include_router(project_router)
app.include_router(proposal_router)
app.include_router(contract_router)
app.include_router(escrow_router)
app.include_router(file_router)
app.include_router(ai_router)               # Phase 4: AI, disputes, verification
app.include_router(messaging_router)        # Phase 5: REST messaging + WS /ws/chat
app.include_router(notification_router)     # Phase 5: /notifications/*
app.include_router(github_router)           # POST /github/parse, GET /github/profile
app.include_router(recommend_router)        # POST /recommend/job/{id}, POST /recommend/preview, GET /recommend/job/{id}/cached
app.include_router(subscription_router)
app.include_router(launchpad_router)        # Phase 4: GET /launchpad, POST /launchpad/reserve/{id}
app.include_router(skill_growth_router)  # GET /skill-growth/my, POST /skill-growth/analyze
app.include_router(internal_router)      # ML-02: /internal/* (AI service internal calls)

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {
        "message": "SkillLink API is running!",
        "docs":    "Visit http://localhost:8000/docs to test the API",
        "version": "4.0.0",
        "phase":   "Phase 5 — Messaging, WebSocket Chat & Notifications",
    }

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}

@app.get("/health/detailed", tags=["Health"])
def health_detailed():
    """Checks DB connection and reports online WebSocket users."""
    try:
        from notification_service import ws_manager
        ws_online = len(ws_manager.online_user_ids)
    except Exception:
        ws_online = 0
    try:
        db            = SessionLocal()
        user_count    = db.query(models.User).count()
        project_count = db.query(models.Project).count()
        notif_count   = db.query(models.Notification).count()
        db.close()
        return {
            "status":              "✅ Database connection successful",
            "total_users":         user_count,
            "total_projects":      project_count,
            "total_notifications": notif_count,
            "ws_online_users":     ws_online,
        }
    except Exception as e:
        return {"status": "❌ Database connection failed", "error": str(e)}

@app.get("/test-db", tags=["Health"])
def test_database():
    try:
        db            = SessionLocal()
        user_count    = db.query(models.User).count()
        project_count = db.query(models.Project).count()
        db.close()
        return {
            "status":         "✅ Database connection successful",
            "total_users":    user_count,
            "total_projects": project_count,
        }
    except Exception as e:
        return {"status": "❌ Database connection failed", "error": str(e)}