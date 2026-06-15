"""
services/skill_growth_service.py
──────────────────────────────────
DEV-07: Skill Growth & Analytics

Pipeline:
  1. Normalize user skills → match against taxonomy
  2. Detect top categories from user skill set
  3. Compute market gap (trending skills user is missing)
  4. Recommend courses via TF-IDF cosine similarity
  5. Return structured response
"""

from __future__ import annotations

import json
import pandas as pd
import joblib
import numpy as np
from pathlib import Path
from collections import Counter
from sklearn.metrics.pairwise import cosine_similarity

# ── Paths ──────────────────────────────────────────────────────────────────────
MODEL_DIR = Path("./skillink_model")

# ── Load models once at startup ────────────────────────────────────────────────
try:
    _TFIDF   = joblib.load(MODEL_DIR / "tfidf_dev07.joblib")
    _CLF     = joblib.load(MODEL_DIR / "clf_category_dev07.joblib")
    _LE      = joblib.load(MODEL_DIR / "label_encoder_dev07.joblib")
    _COURSES = pd.read_csv(MODEL_DIR / "courses_clean.csv")
    _COURSE_MATRIX = _TFIDF.transform(_COURSES["skills_clean"].fillna(""))
    _MODELS_LOADED = True
except Exception as _e:
    import warnings
    warnings.warn(f"skill_growth models failed to load: {_e}")
    _TFIDF = _CLF = _LE = _COURSES = _COURSE_MATRIX = None
    _MODELS_LOADED = False

with open(MODEL_DIR / "it_skill_taxonomy.json") as f:
    _TAXONOMY: dict = json.load(f)


# ── Helper: normalize skill string ─────────────────────────────────────────────

def _normalize(skill: str) -> str:
    return skill.lower().strip()


# ── Helper: find skill in taxonomy ─────────────────────────────────────────────

def _find_in_taxonomy(skill: str):
    """
    Returns (canonical_name, category, skill_data) or None.
    Checks exact match then alias match.
    """
    s = _normalize(skill)
    for category, cat_data in _TAXONOMY["categories"].items():
        for skill_name, skill_data in cat_data["skills"].items():
            if s == skill_name.lower():
                return skill_name, category, skill_data
            if s in [a.lower() for a in skill_data["aliases"]]:
                return skill_name, category, skill_data
    return None


# ── Helper: recommend courses ───────────────────────────────────────────────────

def _recommend_courses(gap_skills: list[str], top_n: int = 5) -> list[dict]:
    """
    TF-IDF cosine similarity between gap skills and course skill vectors.
    Returns top_n most relevant courses.
    """
    if not _MODELS_LOADED or not gap_skills:
        return []

    query = " ".join(gap_skills).lower()
    query_vec = _TFIDF.transform([query])
    scores = cosine_similarity(query_vec, _COURSE_MATRIX).flatten()
    top_idx = scores.argsort()[::-1][:top_n]

    results = []
    for idx in top_idx:
        row = _COURSES.iloc[idx]
        results.append({
            "course_name": row["Course Name"],
            "difficulty":  row["Difficulty Level"],
            "rating":      round(float(row["Course Rating"]), 1),
            "url":         row["Course URL"],
            "category":    row["category"],
            "match_score": round(float(scores[idx]), 4),
        })
    return results


# ── Main service function ───────────────────────────────────────────────────────

def get_skill_growth_analysis(profile: dict) -> dict:
    """
    Full DEV-07 pipeline.

    Args:
        profile: {
            freelancer_id: int,
            skills:        list[str],
            top_n_courses: int  (optional, default 5)
        }

    Returns:
        {
            freelancer_id:       int,
            known_skills:        list[str],
            top_categories:      list[str],
            market_gap:          list[GapSkill],
            recommended_courses: list[Course],
            category_scores:     dict[str, int]
        }
    """
    freelancer_id = profile["freelancer_id"]
    raw_skills    = profile.get("skills", [])
    top_n         = int(profile.get("top_n_courses", 5))

    # ── Step 1: Match user skills against taxonomy ──────────────────────────
    category_votes: Counter = Counter()
    known_skills: dict = {}

    for skill in raw_skills:
        result = _find_in_taxonomy(skill)
        if result:
            canonical, category, data = result
            category_votes[category] += data["demand_score"]
            known_skills[canonical] = {
                "category":     category,
                "demand_score": data["demand_score"],
                "level":        data["level"],
                "trending":     data["trending"],
            }

    # ── Step 2: Top 2 categories ────────────────────────────────────────────
    top_categories = [cat for cat, _ in category_votes.most_common(2)]

    # Fallback: if no known skills match, use all categories
    if not top_categories:
        top_categories = list(_TAXONOMY["categories"].keys())[:2]

    # ── Step 3: Market gap (trending skills user is missing) ────────────────
    gap_skills: list[dict] = []
    for category in top_categories:
        cat_skills = _TAXONOMY["categories"][category]["skills"]
        for skill_name, skill_data in cat_skills.items():
            if skill_data["trending"] and skill_name not in known_skills:
                gap_skills.append({
                    "skill":        skill_name,
                    "category":     category,
                    "demand_score": skill_data["demand_score"],
                    "level":        skill_data["level"],
                })

    # Sort by demand score descending
    gap_skills = sorted(gap_skills, key=lambda x: x["demand_score"], reverse=True)

    # ── Step 4: Course recommendations for top gap skills ───────────────────
    gap_names = [g["skill"] for g in gap_skills[:5]]
    courses   = _recommend_courses(gap_names, top_n=top_n)

    # ── Step 5: Category scores (for radar chart on frontend) ───────────────
    category_scores = {}
    for cat, cat_data in _TAXONOMY["categories"].items():
        user_skills_in_cat = [
            s for s in known_skills
            if known_skills[s]["category"] == cat
        ]
        total_skills_in_cat = len(cat_data["skills"])
        score = round(len(user_skills_in_cat) / max(total_skills_in_cat, 1) * 100)
        category_scores[cat] = score

    return {
        "freelancer_id":       freelancer_id,
        "known_skills":        list(known_skills.keys()),
        "known_skills_detail": list(known_skills.values()),
        "top_categories":      top_categories,
        "market_gap":          gap_skills[:8],
        "recommended_courses": courses,
        "category_scores":     category_scores,
    }