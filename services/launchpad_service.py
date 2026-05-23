"""
services/launchpad_service.py
──────────────────────────────
Core logic for DEV-04: AI Launchpad (Starter Projects).

Pipeline:
  1. Beginner check   → clf_beginner.joblib
                        Input : [completed_projects, years_experience]
                        Output: True / False

  2. Skill matching   → skill_map.json
                        Maps freelancer skills → sub-categories
                        Filters the starter-project pool to relevant ones

  3. Difficulty score → pipeline_difficulty.joblib
                        Input : project title + description (TF-IDF → classifier)
                        Output: difficulty label ("beginner" | "easy" | ...)
                        Only "beginner" and "easy" pass through to the response

  4. Match scoring    → skill overlap  (same logic as SkillinkRecommender)
                        Returns ranked list of StarterProject dicts
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import joblib
import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────────
MODEL_DIR = Path("./skillink_model")

# ── Load models once at import time ──────────────────────────────────────────
# Graceful fallback: if a model was saved with an incompatible NumPy version
# (BitGenerator pickle format changed between NumPy 1.x and 2.x), the service
# falls back to simple threshold logic rather than crashing on startup.
try:
    _CLF_BEGINNER = joblib.load(MODEL_DIR / "clf_beginner.joblib")
except Exception as _e:
    import warnings
    warnings.warn(f"clf_beginner.joblib failed to load ({_e}); using threshold fallback")
    _CLF_BEGINNER = None

try:
    _PIPELINE_DIFFICULTY = joblib.load(MODEL_DIR / "pipeline_difficulty.joblib")
except Exception as _e:
    import warnings
    warnings.warn(f"pipeline_difficulty.joblib failed to load ({_e}); defaulting difficulty to 'beginner'")
    _PIPELINE_DIFFICULTY = None

with open(MODEL_DIR / "skill_map.json") as f:
    _SKILL_MAP: dict[str, list[str]] = json.load(f)   # skill → [sub_category, ...]

# ── Constants ─────────────────────────────────────────────────────────────────
# Difficulty labels that qualify as "starter" projects
STARTER_DIFFICULTIES = {"beginner", "easy"}

# How many slots a new freelancer can reserve at once (DEV-04)
MAX_RESERVE_SLOTS = 3


# ── Hardcoded starter-project pool ───────────────────────────────────────────
# In production this comes from the DB via the backend.
# For Phase 3 (AI service only) we seed a representative pool so the
# endpoint can be tested end-to-end before Phase 4 wires the DB.

_STARTER_POOL: list[dict] = [
    # Technology & Programming
    {
        "project_id": 1001,
        "title": "Simple Python Script for CSV Automation",
        "description": "Write a Python script that reads a CSV file, filters rows by a condition, and exports the result.",
        "required_skills": ["python", "csv", "automation"],
        "sub_category": "Programming & Coding",
        "budget_min": 30.0, "budget_max": 80.0,
    },
    {
        "project_id": 1002,
        "title": "Basic REST API with FastAPI",
        "description": "Build a simple CRUD REST API using FastAPI and SQLite with 3 endpoints.",
        "required_skills": ["python", "fastapi", "rest api", "sqlite"],
        "sub_category": "Programming & Coding",
        "budget_min": 50.0, "budget_max": 120.0,
    },
    {
        "project_id": 1003,
        "title": "React Landing Page",
        "description": "Convert a Figma design to a responsive React landing page. Static data only.",
        "required_skills": ["react", "javascript", "css"],
        "sub_category": "Website Development",
        "budget_min": 60.0, "budget_max": 150.0,
    },
    {
        "project_id": 1004,
        "title": "SQL Database Schema Design",
        "description": "Design and document a relational database schema for a small e-commerce app. Provide ERD and CREATE TABLE statements.",
        "required_skills": ["sql", "mysql", "databases"],
        "sub_category": "Databases",
        "budget_min": 40.0, "budget_max": 100.0,
    },
    {
        "project_id": 1005,
        "title": "Bug Fix in Django App",
        "description": "Fix 3 documented bugs in an existing Django application. Tests provided.",
        "required_skills": ["python", "django"],
        "sub_category": "Programming & Coding",
        "budget_min": 40.0, "budget_max": 90.0,
    },
    {
        "project_id": 1006,
        "title": "WordPress Plugin Configuration",
        "description": "Install and configure 2 plugins on an existing WordPress site. No custom coding required.",
        "required_skills": ["wordpress", "php"],
        "sub_category": "Website Development",
        "budget_min": 25.0, "budget_max": 60.0,
    },
    # Data Science
    {
        "project_id": 1007,
        "title": "Exploratory Data Analysis (EDA) Report",
        "description": "Perform EDA on a provided dataset using pandas and matplotlib. Deliver a Jupyter notebook.",
        "required_skills": ["python", "pandas", "numpy", "data analysis"],
        "sub_category": "Data Science & Analysis",
        "budget_min": 50.0, "budget_max": 120.0,
    },
    {
        "project_id": 1008,
        "title": "Train a Simple Classifier",
        "description": "Train a logistic regression or decision tree classifier on a provided dataset using scikit-learn. Document accuracy metrics.",
        "required_skills": ["python", "scikit-learn", "machine learning"],
        "sub_category": "Data Science & Analysis",
        "budget_min": 60.0, "budget_max": 130.0,
    },
    # Design
    {
        "project_id": 1009,
        "title": "Logo Design for Small Business",
        "description": "Design 3 logo concepts for a bakery. Deliver editable AI/SVG files.",
        "required_skills": ["logo design", "illustrator", "branding"],
        "sub_category": "Logo Design",
        "budget_min": 40.0, "budget_max": 100.0,
    },
    {
        "project_id": 1010,
        "title": "Figma UI Mockup for Mobile App",
        "description": "Create wireframes and hi-fi mockup for 5 screens of a fitness tracking app.",
        "required_skills": ["figma", "ui/ux", "ui", "ux"],
        "sub_category": "Web Design",
        "budget_min": 50.0, "budget_max": 130.0,
    },
    # Writing
    {
        "project_id": 1011,
        "title": "Blog Post — 800 Words",
        "description": "Write an 800-word SEO-optimised blog post on a provided topic. Keyword list supplied.",
        "required_skills": ["content writing", "seo writing", "copywriting"],
        "sub_category": "Content Writing",
        "budget_min": 20.0, "budget_max": 60.0,
    },
    {
        "project_id": 1012,
        "title": "Proofread a 10-Page Report",
        "description": "Proofread and correct grammar/style in a 10-page business report.",
        "required_skills": ["proofreading"],
        "sub_category": "Proofreading",
        "budget_min": 15.0, "budget_max": 40.0,
    },
    # Mobile
    {
        "project_id": 1013,
        "title": "Simple Flutter Counter App",
        "description": "Build a simple counter app in Flutter with increment, decrement, and reset. Publish to GitHub.",
        "required_skills": ["flutter", "dart", "mobile app development"],
        "sub_category": "Mobile App Development",
        "budget_min": 40.0, "budget_max": 100.0,
    },
    # Testing
    {
        "project_id": 1014,
        "title": "Write Unit Tests for Python Module",
        "description": "Write pytest unit tests for a provided Python module. Aim for 80%+ coverage.",
        "required_skills": ["python", "pytest", "testing"],
        "sub_category": "Software Testing",
        "budget_min": 30.0, "budget_max": 80.0,
    },
    # Marketing
    {
        "project_id": 1015,
        "title": "Social Media Content Calendar (1 Month)",
        "description": "Create a 30-day content calendar with captions and hashtags for Instagram and LinkedIn.",
        "required_skills": ["social media", "copywriting", "content writing"],
        "sub_category": "Social Media Marketing",
        "budget_min": 30.0, "budget_max": 80.0,
    },
]


# ── Helper: skill normalisation ───────────────────────────────────────────────

def _normalise(skill: str) -> str:
    return skill.lower().strip()


def _freelancer_skill_set(skills: list[str]) -> set[str]:
    return {_normalise(s) for s in skills}


# ── Helper: sub-categories from skills ───────────────────────────────────────

def _skills_to_subcats(skills: list[str]) -> set[str]:
    """Map freelancer skills → sub-categories using skill_map.json."""
    result: set[str] = set()
    for skill in skills:
        key = _normalise(skill)
        # exact match first
        if key in _SKILL_MAP:
            result.update(_SKILL_MAP[key])
            continue
        # partial match
        for map_key, cats in _SKILL_MAP.items():
            if map_key in key or key in map_key:
                result.update(cats)
                break
    return result


# ── Helper: match score (skill overlap) ──────────────────────────────────────

def _match_score(
    freelancer_skills: set[str],
    project_skills: list[str],
) -> tuple[float, list[str]]:
    """
    Returns (score 0-1, matched_skill_list).
    score = |overlap| / max(|project_skills|, 1)
    """
    proj_set = {_normalise(s) for s in project_skills}
    overlap  = freelancer_skills & proj_set
    score    = min(len(overlap) / max(len(proj_set), 1), 1.0)
    return round(score, 4), sorted(overlap)


# ── Step 1: Beginner qualification check ─────────────────────────────────────

def _is_beginner(completed_projects: int, years_experience: float) -> tuple[bool, str]:
    """
    Uses clf_beginner.joblib when available, otherwise simple threshold logic.
    Input features: [completed_projects, years_experience]
    Returns (qualified: bool, reason: str)
    """
    if _CLF_BEGINNER is not None:
        X = np.array([[completed_projects, years_experience]])
        prediction = _CLF_BEGINNER.predict(X)[0]
        qualified = bool(prediction == 1)
    else:
        # Fallback: mirrors the model's intended logic
        qualified = completed_projects < 5

    if qualified:
        reason = "You qualify for the AI Launchpad — starter projects reserved for you."
    elif completed_projects >= 5:
        reason = (
            f"You have {completed_projects} completed projects on the platform. "
            "The Launchpad is reserved for freelancers with fewer than 5 projects."
        )
    else:
        reason = (
            f"Your experience level ({years_experience} years) exceeds the Launchpad threshold. "
            "Browse the full project marketplace instead."
        )

    return qualified, reason


# ── Step 2 + 3: Filter pool by difficulty and relevance ──────────────────────

def _score_and_filter_pool(
    freelancer_skills: set[str],
    freelancer_subcats: set[str],
) -> list[dict]:
    """
    For each project in the pool:
      - Run pipeline_difficulty to confirm it's beginner/easy
      - Compute skill-overlap match score
      - Return scored list sorted by match_score desc
    """
    scored: list[dict] = []

    for proj in _STARTER_POOL:
        # ── Difficulty check ─────────────────────────────────────────────────
        if _PIPELINE_DIFFICULTY is not None:
            text = proj["title"] + " " + proj["description"]
            raw = _PIPELINE_DIFFICULTY.predict([text])[0]
            # Model may return string labels or integer class indices depending
            # on whether a LabelEncoder was included in the pipeline.
            difficulty_label = raw.lower() if isinstance(raw, str) else "beginner"
            if difficulty_label not in STARTER_DIFFICULTIES:
                continue  # skip intermediate/advanced projects
        else:
            # All _STARTER_POOL entries are beginner/easy by design
            difficulty_label = "beginner"

        # ── Relevance pre-filter: sub-category overlap ───────────────────────
        proj_subcat = proj.get("sub_category", "")
        # If freelancer has NO sub-cat tags at all, don't pre-filter (show all)
        if freelancer_subcats and proj_subcat not in freelancer_subcats:
            continue

        # ── Skill overlap score ───────────────────────────────────────────────
        score, matched = _match_score(freelancer_skills, proj["required_skills"])

        scored.append({
            "project_id":      proj["project_id"],
            "title":           proj["title"],
            "description":     proj["description"],
            "required_skills": proj["required_skills"],
            "difficulty":      difficulty_label,
            "budget_min":      proj["budget_min"],
            "budget_max":      proj["budget_max"],
            "match_score":     score,
            "matched_skills":  matched,
            "is_reserved":     False,
        })

    # Sort by match_score descending
    scored.sort(key=lambda p: p["match_score"], reverse=True)
    return scored


# ── Public entry point ────────────────────────────────────────────────────────

def get_launchpad_recommendations(profile: dict) -> dict:
    """
    Full Launchpad pipeline.

    Args:
        profile: dict with keys:
            freelancer_id      int
            skills             list[str]
            years_experience   float
            completed_projects int
            bio                str  (optional)

    Returns:
        {
            freelancer_id:          int,
            is_beginner_qualified:  bool,
            reason:                 str,
            recommended_projects:   list[StarterProject]
        }
    """
    freelancer_id      = profile["freelancer_id"]
    skills             = profile.get("skills", [])
    years_experience   = float(profile.get("years_experience", 0.0))
    completed_projects = int(profile.get("completed_projects", 0))

    # ── Step 1: Beginner check ────────────────────────────────────────────────
    qualified, reason = _is_beginner(completed_projects, years_experience)

    if not qualified:
        return {
            "freelancer_id":         freelancer_id,
            "is_beginner_qualified": False,
            "reason":                reason,
            "recommended_projects":  [],
        }

    # ── Step 2: Build freelancer skill set + sub-category tags ────────────────
    freelancer_skills  = _freelancer_skill_set(skills)
    freelancer_subcats = _skills_to_subcats(skills)

    # ── Step 3: Score and filter starter pool ────────────────────────────────
    projects = _score_and_filter_pool(freelancer_skills, freelancer_subcats)

    # ── Step 4: Cap at MAX_RESERVE_SLOTS worth of top results to show ─────────
    # We show more than MAX_RESERVE_SLOTS so the freelancer can browse,
    # but the reserve action on the frontend enforces the slot limit.
    top_projects = projects[:10]

    return {
        "freelancer_id":         freelancer_id,
        "is_beginner_qualified": True,
        "reason":                reason,
        "recommended_projects":  top_projects,
    }