"""
main.py — Application Entry Point
====================================
This is the first file that runs when Docker starts your backend.

It does 5 things in order:
  1. Creates all database tables (skips ones that already exist)
  2. Makes sure the uploads folder exists
  3. Creates the FastAPI app with documentation
  4. Serves uploaded files as accessible URLs
  5. Registers all the route files (auth, users, admin)
"""

import logging
import os
import time
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from db import engine
import models
from routers.auth_router  import router as auth_router
from routers.user_router  import router as user_router
from routers.admin_router import router as admin_router

# ── Step 2: Create uploads folder ────────────────────────────────────────────
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── Step 3: Create the FastAPI app ────────────────────────────────────────────
app = FastAPI(
    title       = "SkillLink API",
    version     = "1.0.0",
    description = """
## SkillLink — AI-Powered Freelance Platform

### How to test this API (step by step)

**Step 1** — Register an account:
- Click on `POST /auth/register` → Try it out
- Fill in email, password, and role (`freelancer`, `client`, or `admin`)
- Click Execute

**Step 2** — Log in:
- Click on `POST /auth/login` → Try it out
- Fill in your email and password
- Click Execute
- Copy the `access_token` from the response

**Step 3** — Authorize:
- Click the green **Authorize** button at the top right of this page
- Paste your `access_token` into the field
- Click Authorize, then Close

**Step 4** — Use the API:
- All endpoints with a lock icon now work automatically
- Try `GET /users/me` to see your account info

### Roles
| Role | What they can access |
|---|---|
| freelancer | own profile, portfolio upload |
| client | own profile, company info |
| admin | everything above + all /admin/* endpoints |
""",
)

# ── Step 1: Create all tables ─────────────────────────────────────────────────
# Safe to run every time — skips tables that already exist
# Use startup event to wait for DB to be ready before metadata operations.

@app.on_event("startup")
def startup_create_tables():
    retries = 30
    for attempt in range(1, retries + 1):
        try:
            models.Base.metadata.create_all(bind=engine)
            logging.info("Database tables created successfully")
            break
        except OperationalError as exc:
            logging.warning(
                "Database not ready yet, try %s/%s. Error: %s",
                attempt,
                retries,
                exc,
            )
            time.sleep(1)
    else:
        raise RuntimeError("Could not connect to database after several retries")

# ── Step 4: Serve uploaded files ──────────────────────────────────────────────
# After a portfolio upload, the file is accessible at:
# http://localhost:8000/uploads/portfolios/<filename>
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Step 5: Register all route files ─────────────────────────────────────────
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(admin_router)


# ── Health checks ──────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {
        "message": "SkillLink API is running!",
        "docs":    "Visit http://localhost:8000/docs to test the API",
        "version": "1.0.0",
    }

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}