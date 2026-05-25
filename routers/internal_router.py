"""
routers/internal_router.py — ML-02: Internal endpoints for AI ↔ Backend communication.

Endpoints here are NOT protected by user JWT.
They require the X-Internal-Key header (shared secret between services).
Only accessible from within the Docker network — not reachable externally.
"""

import os
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from db import get_db
import models

router = APIRouter(prefix="/internal", tags=["Internal"])

_INTERNAL_KEY = os.environ.get("INTERNAL_SECRET", "skillink-retrain-internal-2024")


def _verify_key(x_internal_key: str = Header(...)):
    if x_internal_key != _INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid internal key")


@router.get("/ml/training-data", dependencies=[Depends(_verify_key)])
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
