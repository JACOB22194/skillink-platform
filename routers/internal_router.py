"""
routers/internal_router.py — ML-02: Internal endpoints for AI ↔ Backend communication.

Endpoints here are NOT protected by user JWT.
They use HMAC-SHA256 request signing: the caller sends X-Timestamp + X-Signature
headers. The backend recomputes the expected signature and rejects requests older
than 30 seconds (replay-attack window).
Only accessible from within the Docker network — not reachable externally.
"""

import hashlib
import hmac
import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from db import get_db
import models

router = APIRouter(prefix="/internal", tags=["Internal"])

_INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "skillink-retrain-internal-2024")
_REPLAY_WINDOW_SECONDS = 30


def _verify_hmac(
    request: Request,
    x_timestamp: str = Header(...),
    x_signature: str = Header(...),
):
    try:
        ts = int(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid timestamp")

    if abs(time.time() - ts) > _REPLAY_WINDOW_SECONDS:
        raise HTTPException(status_code=403, detail="Request expired")

    message = f"{x_timestamp}:{request.method}:{request.url.path}"
    expected = hmac.new(
        _INTERNAL_SECRET.encode(), message.encode(), hashlib.sha256
    ).hexdigest()

    # constant-time comparison prevents timing-based secret extraction
    if not hmac.compare_digest(expected, x_signature):
        raise HTTPException(status_code=403, detail="Invalid signature")


@router.get("/ml/training-data", dependencies=[Depends(_verify_hmac)])
def get_ml_training_data(db: Session = Depends(get_db)):
    """
    Return labeled project data for AI service retraining.
    Called by the AI service APScheduler nightly job.
    """
    projects = (
        db.query(models.Project)
        .filter(
            models.Project.sub_category.isnot(None),
            models.Project.category.isnot(None),
        )
        .all()
    )
    data = [
        {
            "project_id":   p.project_id,
            "title":        p.title        or "",
            "description":  p.description  or "",
            "category":     p.category,
            "sub_category": p.sub_category,
        }
        for p in projects
        if p.sub_category and p.category
    ]
    return {"count": len(data), "projects": data}
