"""
main.py — Application Entry Point (Phase 3 Update)
====================================
Phase 3 additions:
  - Registered: project_router, proposal_router, contract_router,
                escrow_router, file_router
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
from routers.admin_router    import router as admin_router
from routers.project_router  import router as project_router
from routers.proposal_router import router as proposal_router
from routers.contract_router import router as contract_router
from routers.escrow_router   import router as escrow_router
from routers.file_router     import router as file_router

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
    version     = "2.0.0",
    description = """
## SkillLink — AI-Powered Freelance Platform

### Phase 3: Core Platform Features

**Authentication (Phase 2)**
- `POST /auth/register` — Create an account
- `POST /auth/login` — Log in and get JWT tokens
- `POST /auth/refresh` — Refresh your access token
- `POST /auth/mfa/setup` — Enable/disable MFA
- `POST /auth/verify-mfa` — Complete MFA login
- `POST /auth/change-password` — Change password

**Projects**
- `POST /projects` — Create a project *(client)*
- `GET /projects` — Browse open projects
- `GET /projects/my` — My projects
- `GET /projects/{id}` — View one project
- `PUT /projects/{id}` — Edit project *(owner)*
- `DELETE /projects/{id}` — Delete project *(owner/admin)*

**Proposals**
- `POST /proposals` — Submit a proposal *(freelancer)*
- `GET /proposals/project/{id}` — Proposals for a project *(owner)*
- `GET /proposals/my` — My submitted proposals *(freelancer)*
- `PUT /proposals/{id}/status` — Accept or reject *(client)*
- `DELETE /proposals/{id}` — Withdraw proposal *(freelancer)*

**Contracts & Milestones**
- `GET /contracts/my` — My contracts
- `GET /contracts/{id}` — View a contract
- `POST /contracts/{id}/milestones` — Add milestone *(client)*
- `GET /contracts/{id}/milestones` — List milestones
- `PUT /milestones/{id}/status` — Approve/pay milestone
- `POST /contracts/{id}/complete` — Complete contract *(client)*
- `POST /contracts/{id}/dispute` — Open dispute

**Escrow & Wallet**
- `POST /escrow/fund/{contract_id}` — Fund escrow *(client)*
- `GET /escrow/{contract_id}` — Check escrow status
- `POST /escrow/release/{milestone_id}` — Release milestone funds
- `GET /wallet/balance` — My balance *(freelancer)*
- `POST /wallet/withdraw` — Withdraw funds *(freelancer)*
- `GET /wallet/transactions` — Transaction history *(freelancer)*

**Files**
- `POST /files/upload/{project_id}` — Upload a file
- `GET /files/project/{project_id}` — List project files
- `GET /files/{id}` — File metadata
- `DELETE /files/{id}` — Delete file

**Profiles & Admin** *(Phase 2)*
- `GET /users/me`, `PUT /users/me/profile`, `POST /users/me/portfolio`
- `GET /admin/stats`, `GET /admin/users`, etc.

---
### How to authenticate:
1. Register → Login → copy `access_token` → click **Authorize** → paste token
""",
)


# ── CORS middleware ───────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve uploaded files ──────────────────────────────────────────────────────
# After a portfolio upload, the file is accessible at:
# http://localhost:8000/uploads/portfolios/<filename>

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Phase 2 routers
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(admin_router)

# Phase 3 routers
app.include_router(project_router)
app.include_router(proposal_router)
app.include_router(contract_router)
app.include_router(escrow_router)
app.include_router(file_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "SkillLink API is running!",
        "docs":    "Visit http://localhost:8000/docs to test the API",
        "version": "2.0.0",
        "phase":   "Phase 3 — Core Platform Features",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


@app.get("/test-db", tags=["Health"])
def test_database():
    try:
        db = SessionLocal()
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