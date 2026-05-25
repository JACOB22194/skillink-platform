import joblib
import numpy as np
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ── Paths ──────────────────────────────────────────────────────────────────
BASE = os.path.join(os.path.dirname(__file__), "..", "skillink_model", "pricing_model_v2")

# ── Load artifacts once at startup ────────────────────────────────────────
model_min = joblib.load(os.path.join(BASE, "model_min.joblib"))
model_max = joblib.load(os.path.join(BASE, "model_max.joblib"))
model_avg = joblib.load(os.path.join(BASE, "model_avg.joblib"))
le_cat    = joblib.load(os.path.join(BASE, "le_cat.joblib"))
le_exp    = joblib.load(os.path.join(BASE, "le_exp.joblib"))

KNOWN_CATEGORIES  = list(le_cat.classes_)
KNOWN_EXPERIENCES = list(le_exp.classes_)   # ['Beginner', 'Expert', 'Intermediate']


def _resolve_category(user_category: str) -> tuple[str, bool]:
    """Return (matched_category, is_exact). Falls back to TF-IDF similarity."""
    if user_category in KNOWN_CATEGORIES:
        return user_category, True
    # Semantic fallback
    vec = TfidfVectorizer().fit(KNOWN_CATEGORIES + [user_category])
    sims = cosine_similarity(
        vec.transform([user_category]),
        vec.transform(KNOWN_CATEGORIES)
    ).flatten()
    return KNOWN_CATEGORIES[int(sims.argmax())], False


def _resolve_experience(user_exp: str) -> str:
    """Case-insensitive match; defaults to 'Intermediate'."""
    for e in KNOWN_EXPERIENCES:
        if e.lower() == user_exp.lower():
            return e
    return "Intermediate"


def predict_price(category: str, experience: str) -> dict:
    """
    Returns:
        {
          "min": float, "max": float, "avg": float,
          "matched_category": str, "exact_match": bool,
          "experience": str
        }
    """
    matched_cat, exact = _resolve_category(category)
    resolved_exp       = _resolve_experience(experience)

    c_enc = le_cat.transform([matched_cat])[0]
    e_enc = le_exp.transform([resolved_exp])[0]
    X     = [[c_enc, e_enc]]

    return {
        "min":              round(float(model_min.predict(X)[0]), 2),
        "max":              round(float(model_max.predict(X)[0]), 2),
        "avg":              round(float(model_avg.predict(X)[0]), 2),
        "matched_category": matched_cat,
        "exact_match":      exact,
        "experience":       resolved_exp,
    }


def get_supported_categories() -> list[str]:
    return KNOWN_CATEGORIES


def get_supported_experiences() -> list[str]:
    return KNOWN_EXPERIENCES