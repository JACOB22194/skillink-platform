"""
services/retrain_service.py  — ML-02: Automated Model Retraining Pipeline

Fetches labeled project data from the backend (or uses data passed directly),
retrains the job-classifier pipeline, evaluates against the current model,
and hot-swaps in-memory globals when the new model is better.

Versioned artifacts are saved under:
    skillink_model/versions/v{N}/{lr_sub,lr_cat,svc_sub,tfidf,le_sub,le_cat}.joblib
    skillink_model/version_history.json  — all version metadata
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.svm import LinearSVC

log = logging.getLogger("retrain")

MODEL_DIR    = Path("/app/skillink_model")
VERSIONS_DIR = MODEL_DIR / "versions"
VERSION_FILE = MODEL_DIR / "version_history.json"

MIN_SAMPLES  = 30
INTERNAL_KEY = os.environ.get("INTERNAL_SECRET", "skillink-retrain-internal-2024")

_status: dict = {
    "running":     False,
    "last_run":    None,
    "last_result": None,
}


# ── Public API ─────────────────────────────────────────────────────────────────

def get_status() -> dict:
    h = _load_history()
    return {
        **_status,
        "current_version": h.get("current_version", 0),
        "current_meta":    h.get("current_meta", {}),
    }


def get_history() -> list:
    return _load_history().get("versions", [])


def run_retrain(projects: list[dict], model_registry: dict) -> dict:
    """
    Retrain using the supplied labeled project list.
    Called from the retrain_router when the backend sends data.
    Thread-safe: updates model_registry in-place on success.
    """
    _status["running"] = True
    _status["last_run"] = datetime.now(timezone.utc).isoformat()
    try:
        result = _do_retrain(projects, model_registry)
    except Exception as exc:
        result = {"status": "error", "error": str(exc)}
        log.exception("Retrain failed")
    _status["running"] = False
    _status["last_result"] = result
    return result


def run_scheduled_retrain(model_registry: dict) -> None:
    """
    Called by APScheduler (nightly).
    Fetches training data from the backend, then retrains.
    """
    backend_url = os.environ.get("BACKEND_URL", "http://backend:8000")
    _status["running"] = True
    _status["last_run"] = datetime.now(timezone.utc).isoformat()
    try:
        projects = _fetch_from_backend(backend_url)
        result   = _do_retrain(projects, model_registry)
    except Exception as exc:
        result = {"status": "error", "error": str(exc)}
        log.exception("Scheduled retrain failed")
    _status["running"] = False
    _status["last_result"] = result


# ── Internal helpers ───────────────────────────────────────────────────────────

def _load_history() -> dict:
    if VERSION_FILE.exists():
        return json.loads(VERSION_FILE.read_text())
    return {"current_version": 0, "current_meta": {}, "versions": []}


def _save_history(h: dict) -> None:
    VERSION_FILE.write_text(json.dumps(h, indent=2, default=str))


def _fetch_from_backend(backend_url: str) -> list[dict]:
    with httpx.Client(timeout=60) as c:
        r = c.get(
            f"{backend_url}/internal/ml/training-data",
            headers={"x-internal-key": INTERNAL_KEY},
        )
        r.raise_for_status()
    return r.json().get("projects", [])


def _do_retrain(projects: list[dict], model_registry: dict) -> dict:
    n = len(projects)
    log.info("Retrain: %d labeled projects", n)

    if n < MIN_SAMPLES:
        return {"status": "insufficient_data", "n_samples": n, "required": MIN_SAMPLES}

    texts      = [(p.get("title", "") + " " + p.get("description", "")).strip() for p in projects]
    sub_labels = [p["sub_category"] for p in projects]
    cat_labels  = [p["category"]     for p in projects]

    n_sub_cls = len(set(sub_labels))
    n_cat_cls = len(set(cat_labels))
    if n_sub_cls < 2 or n_cat_cls < 2:
        return {
            "status": "insufficient_data",
            "error":  f"need ≥2 classes (sub={n_sub_cls}, cat={n_cat_cls})",
        }

    # Encode labels
    le_sub = LabelEncoder()
    le_cat = LabelEncoder()
    y_sub  = le_sub.fit_transform(sub_labels)
    y_cat  = le_cat.fit_transform(cat_labels)

    # Train / test split — stratify only when we have enough samples per class
    strat = y_sub if n >= 2 * n_sub_cls else None
    X_tr, X_te, ys_tr, ys_te, yc_tr, yc_te = train_test_split(
        texts, y_sub, y_cat, test_size=0.2, random_state=42, stratify=strat,
    )

    # TF-IDF vectoriser
    tfidf = TfidfVectorizer(
        max_features=5000, stop_words="english",
        ngram_range=(1, 2), sublinear_tf=True, min_df=1,
    )
    Xtr = tfidf.fit_transform(X_tr)
    Xte = tfidf.transform(X_te)

    # Sub-category: logistic regression
    lr_sub = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
    lr_sub.fit(Xtr, ys_tr)

    # Category: logistic regression
    lr_cat = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
    lr_cat.fit(Xtr, yc_tr)

    # Sub-category: calibrated SVC (ensemble partner)
    cv_folds = max(2, min(3, int(min(np.bincount(ys_tr)))))
    svc_sub  = CalibratedClassifierCV(
        LinearSVC(C=1.0, max_iter=2000, random_state=42), cv=cv_folds,
    )
    svc_sub.fit(Xtr, ys_tr)

    # Evaluate (ensemble of LR + SVC)
    p_sub     = (lr_sub.predict_proba(Xte) + svc_sub.predict_proba(Xte)) / 2
    y_hat_sub = np.argmax(p_sub, axis=1)
    sub_acc   = accuracy_score(ys_te, y_hat_sub)
    sub_f1    = f1_score(ys_te, y_hat_sub, average="macro", zero_division=0)
    cat_acc   = accuracy_score(yc_te, lr_cat.predict(Xte))

    new_meta = {
        "sub_test_acc": round(sub_acc, 4),
        "sub_f1_macro": round(sub_f1, 4),
        "cat_test_acc": round(cat_acc, 4),
        "num_sub":      int(n_sub_cls),
        "num_cat":      int(n_cat_cls),
        "n_samples":    n,
        "trained_at":   datetime.now(timezone.utc).isoformat(),
    }

    # Compare with current model — only deploy if genuinely better
    history  = _load_history()
    cur_acc  = history.get("current_meta", {}).get("sub_test_acc", 0.0)
    if sub_acc <= cur_acc:
        return {
            "status":      "no_improvement",
            "new_acc":     sub_acc,
            "current_acc": cur_acc,
            "metrics":     new_meta,
        }

    # Save versioned artifacts
    VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
    ver     = history.get("current_version", 0) + 1
    ver_dir = VERSIONS_DIR / f"v{ver}"
    ver_dir.mkdir(exist_ok=True)

    artifacts = {
        "tfidf":  tfidf,  "lr_sub": lr_sub, "lr_cat": lr_cat,
        "svc_sub": svc_sub, "le_sub": le_sub, "le_cat": le_cat,
    }
    for name, obj in artifacts.items():
        joblib.dump(obj, ver_dir / f"{name}.joblib")
    new_meta["version"] = ver
    (ver_dir / "metadata.json").write_text(json.dumps(new_meta, indent=2))

    # Hot-swap in-memory registry
    model_registry.update({
        "retrained_tfidf":   tfidf,
        "retrained_lr_sub":  lr_sub,
        "retrained_lr_cat":  lr_cat,
        "retrained_svc_sub": svc_sub,
        "retrained_le_sub":  le_sub,
        "retrained_le_cat":  le_cat,
        "retrained_meta":    new_meta,
    })

    history["current_version"] = ver
    history["current_meta"]    = new_meta
    history.setdefault("versions", []).append(new_meta)
    _save_history(history)

    log.info("Retrain v%d deployed: sub_acc %.4f → %.4f", ver, cur_acc, sub_acc)
    return {"status": "deployed", "version": ver, "metrics": new_meta}
