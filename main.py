"""
main.py — Application Entry Point
====================================
Phase 4 Update:
  - Registered: phase4_router (AI, disputes, verification, messaging)
  - Registered: freelancer_router (search endpoint from user_router)
"""

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
from routers.auth_router     import router as auth_router
from routers.user_router     import router as user_router
from routers.user_router     import freelancer_router
from routers.admin_router    import router as admin_router
from routers.project_router  import router as project_router
from routers.proposal_router import router as proposal_router
from routers.contract_router import router as contract_router
from routers.escrow_router   import router as escrow_router
from routers.file_router     import router as file_router
from routers.ai_router       import router as phase4_router

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

    yield
    logging.info("SkillLink API shutting down.")


app = FastAPI(
    lifespan    = lifespan,
    title       = "SkillLink API",
    version     = "3.0.0",
    description = """
## SkillLink — AI-Powered Freelance Platform

### Phase 4: AI Integration, Disputes, Verification & Messaging

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

**AI Features** ✅ NEW
- `GET /projects/{id}/ai-match` — AI-ranked freelancers for a project
- `POST /projects/{id}/ai-pricing` — AI-suggested budget range
- `POST /proposals/{id}/score` — AI relevance score for a proposal

**Proposals**
- `POST /proposals` — Submit proposal *(freelancer)*
- `GET /proposals/project/{id}` — Proposals for a project *(owner)*
- `GET /proposals/my` — My submitted proposals *(freelancer)*
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
- `POST /contracts/{id}/review` — Submit review ✅ NEW
- `GET /contracts/{id}/review` — Get review ✅ NEW

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
- `GET /users/me/profile` — My profile (with skills)
- `PUT /users/me/profile` — Edit profile
- `POST /users/me/portfolio` — Upload portfolio *(freelancer)*
- `POST /users/me/skills` — Add skills ✅ NEW
- `DELETE /users/me/skills` — Remove skills ✅ NEW
- `GET /freelancers/search` — Search freelancers ✅ NEW
- `GET /users/{id}` — View any user

**Disputes** ✅ NEW
- `GET /admin/disputes` — List all disputes
- `GET /admin/disputes/{id}` — Get one dispute
- `POST /admin/disputes/{id}/resolve` — Resolve dispute

**Verification** ✅ NEW
- `POST /verification/submit` — Submit identity document
- `GET /verification/status` — My verification status
- `GET /admin/verification` — All verifications *(admin)*
- `PATCH /admin/verification/{id}` — Approve/reject *(admin)*

**Messaging** ✅ NEW
- `POST /messages` — Send a message
- `GET /messages/inbox` — Inbox (grouped by partner)
- `GET /messages/{user_id}` — Full conversation
- `PATCH /messages/{user_id}/read` — Mark as read

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
""",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # In production, specify your frontend URL
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Static uploads ────────────────────────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(freelancer_router)    # GET /freelancers/search
app.include_router(admin_router)
app.include_router(project_router)
app.include_router(proposal_router)
app.include_router(contract_router)
app.include_router(escrow_router)
app.include_router(file_router)
app.include_router(phase4_router)        # Phase 4: AI, disputes, verification, messaging


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {
        "message": "SkillLink API is running!",
        "docs":    "Visit http://localhost:8000/docs to test the API",
        "version": "3.0.0",
        "phase":   "Phase 4 — AI Integration, Disputes, Verification & Messaging",
    }

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}

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