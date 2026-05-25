"""
services/ab_service.py — ML-06: A/B Testing & Traffic Splitting

Manages experiment state in-memory and persists to ab_experiment.json.
route_request() uses MD5 hash for deterministic, sticky assignment.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("ab_service")

AB_STATE_FILE = Path("/app/skillink_model/ab_experiment.json")

_experiment: dict = {}

# Load persisted state on module import
try:
    if AB_STATE_FILE.exists():
        _experiment = json.loads(AB_STATE_FILE.read_text())
except Exception:
    _experiment = {}


def _save() -> None:
    try:
        AB_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        AB_STATE_FILE.write_text(json.dumps(_experiment, indent=2, default=str))
    except Exception as e:
        log.warning("ab_service: could not save state: %s", e)


# ── Public API ─────────────────────────────────────────────────────────────────

def get_experiment() -> dict:
    return _experiment


def start_experiment(name: str, treatment_version: int, traffic_split: float = 0.5) -> dict:
    """Start a new A/B experiment. Replaces any active one."""
    global _experiment
    _experiment = {
        "active":            True,
        "name":              name,
        "control_version":   0,       # 0 = original production model
        "treatment_version": treatment_version,
        "traffic_split":     traffic_split,  # fraction routed to treatment
        "control_correct":   0,
        "control_total":     0,
        "treatment_correct": 0,
        "treatment_total":   0,
        "started_at":        datetime.now(timezone.utc).isoformat(),
        "stopped_at":        None,
    }
    _save()
    log.info(
        "A/B experiment '%s' started (v0 vs v%d, split=%.0f%%)",
        name, treatment_version, traffic_split * 100,
    )
    return _experiment


def stop_experiment() -> dict:
    global _experiment
    if not _experiment:
        return {"error": "No active experiment"}
    _experiment["active"]     = False
    _experiment["stopped_at"] = datetime.now(timezone.utc).isoformat()
    _save()
    return _experiment


def route_request(request_id: str) -> str:
    """
    Deterministic hash-based routing.
    Returns 'treatment' for traffic_split fraction of requests, else 'control'.
    """
    if not _experiment.get("active"):
        return "control"
    h = int(hashlib.md5(request_id.encode()).hexdigest(), 16)
    if (h % 100) < int(_experiment.get("traffic_split", 0.5) * 100):
        return "treatment"
    return "control"


def record_outcome(variant: str, correct: bool | None) -> None:
    """Update running accuracy counters. Called after each prediction."""
    if not _experiment.get("active") or correct is None:
        return
    if variant == "treatment":
        _experiment["treatment_total"] += 1
        if correct:
            _experiment["treatment_correct"] += 1
    else:
        _experiment["control_total"] += 1
        if correct:
            _experiment["control_correct"] += 1
    _save()
