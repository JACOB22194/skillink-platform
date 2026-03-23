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

Fix in this version:
  - Replaced deprecated @app.on_event("startup") with the modern
    lifespan context manager (recommended in FastAPI 0.93+)
"""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from db import engine
import models
from routers.auth_router  import router as auth_router
from routers.user_router  import router as user_router
from routers.admin_router import router as admin_router

# ── Upload folder ─────────────────────────────────────────────────────────────
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Lifespan (replaces the old @app.on_event("startup")) ─────────────────────
# This runs ONCE when the server starts, and again (after yield) when it stops.
# We use it to create database tables safely after waiting for Postgres to be ready.

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
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

    yield   # ← everything above runs at startup; everything below runs at shutdown

    # ── SHUTDOWN (optional cleanup goes here) ────────────────────────────────
    logging.info("SkillLink API shutting down.")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    lifespan    = lifespan,   # ✅ modern way to handle startup/shutdown
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

# ── Serve uploaded files ──────────────────────────────────────────────────────
# After a portfolio upload, the file is accessible at:
# http://localhost:8000/uploads/portfolios/<filename>
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── Register all route files ──────────────────────────────────────────────────
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