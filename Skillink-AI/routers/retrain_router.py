"""
routers/retrain_router.py — ML-02 + ML-06: Retraining & A/B Testing

POST /retrain/trigger         — manual retrain (ML-02)
GET  /retrain/status          — current version + last run info
GET  /retrain/history         — all version snapshots
POST /retrain/hotswap         — load a specific version into the inference registry (ML-06)
POST /retrain/ab/start        — start an A/B experiment (ML-06)
POST /retrain/ab/stop         — stop the active experiment
GET  /retrain/ab/status       — experiment metrics
"""

import json
import joblib
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/retrain", tags=["Model Retraining"])

# Shared model registry — wired from main.py after startup
_REGISTRY: dict = {}

MODEL_DIR    = Path("/app/skillink_model")
VERSIONS_DIR = MODEL_DIR / "versions"


def set_registry(r: dict) -> None:
    global _REGISTRY
    _REGISTRY = r


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class RetrainRequest(BaseModel):
    projects: list[dict] = []


class HotswapRequest(BaseModel):
    version: int = Field(..., ge=1, description="Version number to load, e.g. 1")


class ABStartRequest(BaseModel):
    name:              str   = Field(..., examples=["v1-vs-original"])
    treatment_version: int   = Field(..., ge=1, description="Retrained version to test")
    traffic_split:     float = Field(0.5, ge=0.0, le=1.0, description="Fraction of traffic to treatment")


# ── ML-02: Retrain endpoints ───────────────────────────────────────────────────

@router.post("/trigger")
async def trigger_retrain(
    bg:   BackgroundTasks,
    body: RetrainRequest = Body(default_factory=RetrainRequest),
):
    from services.retrain_service import run_retrain, run_scheduled_retrain, get_status
    if get_status()["running"]:
        raise HTTPException(409, "Retrain already in progress")
    if body.projects:
        bg.add_task(run_retrain, body.projects, _REGISTRY)
    else:
        bg.add_task(run_scheduled_retrain, _REGISTRY)
    return {"status": "triggered", "n_projects": len(body.projects)}


@router.get("/status")
def retrain_status():
    from services.retrain_service import get_status
    return get_status()


@router.get("/history")
def retrain_history():
    from services.retrain_service import get_history
    return {"versions": get_history()}


# ── ML-06: Hot-swap endpoint ───────────────────────────────────────────────────

@router.post("/hotswap")
def hotswap_version(body: HotswapRequest):
    """Load a specific retrained version from disk into the live inference registry."""
    ver_dir = VERSIONS_DIR / f"v{body.version}"
    if not ver_dir.exists():
        raise HTTPException(404, f"Version v{body.version} not found on disk")
    try:
        _REGISTRY.update({
            "retrained_tfidf":   joblib.load(ver_dir / "tfidf.joblib"),
            "retrained_lr_sub":  joblib.load(ver_dir / "lr_sub.joblib"),
            "retrained_lr_cat":  joblib.load(ver_dir / "lr_cat.joblib"),
            "retrained_svc_sub": joblib.load(ver_dir / "svc_sub.joblib"),
            "retrained_le_sub":  joblib.load(ver_dir / "le_sub.joblib"),
            "retrained_le_cat":  joblib.load(ver_dir / "le_cat.joblib"),
        })
        meta_file = ver_dir / "metadata.json"
        meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
        _REGISTRY["retrained_meta"] = meta
        return {"status": "hotswapped", "version": body.version, "meta": meta}
    except Exception as e:
        raise HTTPException(500, f"Failed to load v{body.version}: {e}")


# ── ML-06: A/B experiment endpoints ───────────────────────────────────────────

@router.post("/ab/start")
def ab_start(body: ABStartRequest):
    """Start an A/B experiment: original model (control) vs a retrained version (treatment)."""
    from services.ab_service import start_experiment
    exp = start_experiment(body.name, body.treatment_version, body.traffic_split)
    return {"status": "started", "experiment": exp}


@router.post("/ab/stop")
def ab_stop():
    """Stop the active A/B experiment and return final metrics."""
    from services.ab_service import stop_experiment
    exp = stop_experiment()
    return {"status": "stopped", "experiment": exp}


@router.get("/ab/status")
def ab_status():
    """Return the current A/B experiment state and running accuracy metrics."""
    from services.ab_service import get_experiment
    exp = get_experiment()
    if not exp:
        return {"active": False, "message": "No experiment running"}

    def _acc(correct, total):
        return round(correct / total, 4) if total else None

    return {
        **exp,
        "control_accuracy":   _acc(exp.get("control_correct", 0),   exp.get("control_total", 0)),
        "treatment_accuracy": _acc(exp.get("treatment_correct", 0), exp.get("treatment_total", 0)),
    }
