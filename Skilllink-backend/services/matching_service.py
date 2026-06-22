"""
services/matching_service.py — AI freelancer matching for projects
=====================================================================
Shared by two call sites:
  - GET  /projects/{id}/ai-match   (on-demand, client clicks "Find Talent")
  - POST /projects                 (automatic, runs right after creation)

Business logic lives here so both callers share one implementation —
no duplicated matching/fallback/caching logic across routers.
"""

import json
import logging
import os

import httpx
from sqlalchemy.orm import Session

import models
import schema
from db import SessionLocal
from services.notification_service import notify

logger = logging.getLogger(__name__)

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai:8000")
AI_TIMEOUT = 30.0

# How many top AI matches get an automatic "you've been matched" notification
# when a project is created. On-demand matching (GET /ai-match) still returns
# up to 10 — only the automatic-notification fan-out is capped lower so a
# newly posted project doesn't spam every active freelancer at once.
AUTO_MATCH_NOTIFY_TOP_K = 5


def _parse_json_list(val):
    if not val:
        return []
    try:
        return json.loads(val)
    except Exception:
        return []


def build_freelancer_payloads(db: Session) -> list[dict]:
    """Builds the candidate list the AI service scores against."""
    freelancers = (
        db.query(models.Freelancer)
        .join(models.User, models.User.id == models.Freelancer.user_id)
        .filter(models.User.status == models.UserStatus.active)
        .all()
    )

    payloads = []
    for f in freelancers:
        user = db.query(models.User).filter(models.User.id == f.user_id).first()
        skill_names = [fs.skill.name for fs in f.skills if fs.skill]

        top_languages = _parse_json_list(f.top_languages)
        sub_category_tags = _parse_json_list(f.sub_category_tags)

        profile_text = " ".join(filter(None, [
            f.professional_title or "",
            f.bio or "",
            " ".join(skill_names),
            " ".join(top_languages),
        ]))

        full_name = ""
        if user:
            full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            if not full_name:
                full_name = user.email.split("@")[0]

        payloads.append({
            "freelancer_id":      f.freelancer_id,
            "user_id":            f.user_id,
            "name":               full_name or f"freelancer_{f.freelancer_id}",
            "first_name":         user.first_name if user else None,
            "last_name":          user.last_name if user else None,
            "email":              user.email if user else "",
            "bio":                f.bio or "",
            "professional_title": f.professional_title or "",
            "hourly_rate":        f.hourly_rate or 0,
            "success_score":      f.success_score or 0,
            "github_score":       f.github_score or 0,
            "github_url":         f.github_url or "",
            "skills":             skill_names,
            "top_languages":      top_languages,
            "sub_category_tags":  sub_category_tags,
            "profile_text":       profile_text,
            "github_stats":       {},
        })
    return payloads


def run_ai_match(project: models.Project, db: Session) -> tuple[list[schema.FreelancerSearchResult], str]:
    """
    Ranks freelancers for `project` via the AI service, caches results into
    the Recommendation table, and falls back to success-score ranking if
    the AI service is unavailable.

    Returns (matches, source) where source is "ai" or "fallback".
    """
    required_skills = [ps.skill.name for ps in project.skills if ps.skill]
    freelancer_payloads = build_freelancer_payloads(db)

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/match",
            json={
                "title":           project.title,
                "description":     project.description or "",
                "sub_category":    project.sub_category or "",
                "category":        project.category or "",
                "budget_min":      float(project.budget or 0),
                "budget_max":      float(project.budget or 0),
                "required_skills": required_skills,
                "candidates":      freelancer_payloads,
                "top_k":           10,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data = response.json()

        payload_map = {fp["freelancer_id"]: fp for fp in freelancer_payloads}

        matches = [
            schema.FreelancerSearchResult(
                freelancer_id  = m["freelancer_id"],
                user_id        = payload_map.get(m["freelancer_id"], {}).get("user_id", 0),
                email          = payload_map.get(m["freelancer_id"], {}).get("email", ""),
                first_name     = payload_map.get(m["freelancer_id"], {}).get("first_name"),
                last_name      = payload_map.get(m["freelancer_id"], {}).get("last_name"),
                bio            = payload_map.get(m["freelancer_id"], {}).get("bio"),
                hourly_rate    = m.get("hourly_rate"),
                success_score  = payload_map.get(m["freelancer_id"], {}).get("success_score", 0),
                skills         = payload_map.get(m["freelancer_id"], {}).get("skills", []),
                ai_match_score = round(m.get("match_score", 0) * 100, 1),
            )
            for m in ai_data.get("matches", [])
        ]

        try:
            db.query(models.Recommendation).filter(
                models.Recommendation.project_id == project.project_id
            ).delete()
            for m in ai_data.get("matches", []):
                db.add(models.Recommendation(
                    project_id     = project.project_id,
                    freelancer_id  = m["freelancer_id"],
                    match_score    = m.get("match_score", 0),
                    text_score     = m.get("text_score", 0),
                    skill_score    = m.get("skill_score", 0),
                    quality_score  = m.get("quality_score", 0),
                    matched_skills = json.dumps(m.get("matched_skills", [])),
                ))
            db.commit()
        except Exception as cache_exc:
            logger.warning("Failed to cache recommendations for project %s: %s", project.project_id, cache_exc)
            db.rollback()

        return matches, "ai"

    except Exception as exc:
        logger.warning("AI service unavailable for /match (project %s), using fallback. Error: %s", project.project_id, exc)

    fallback_matches = [
        schema.FreelancerSearchResult(
            freelancer_id  = fp["freelancer_id"],
            user_id        = fp["user_id"],
            email          = fp["email"],
            first_name     = fp.get("first_name"),
            last_name      = fp.get("last_name"),
            bio            = fp.get("bio"),
            hourly_rate    = fp.get("hourly_rate"),
            success_score  = fp.get("success_score", 0),
            skills         = fp.get("skills", []),
            ai_match_score = None,
        )
        for fp in sorted(freelancer_payloads, key=lambda x: x["success_score"], reverse=True)[:10]
    ]
    return fallback_matches, "fallback"


def run_ai_match_and_notify(project_id: int) -> None:
    """
    Automatic pipeline triggered as a background task right after a project
    is created: run AI matching, then notify the top matched freelancers.

    Opens its own DB session — never reuse the request's session in a
    background task, since FastAPI may close it before the task runs.
    Any failure here is caught and logged; it must never surface as an
    error to the client who just created the project.
    """
    with SessionLocal() as db:
        try:
            project = db.query(models.Project).filter(models.Project.project_id == project_id).first()
            if not project:
                return

            matches, source = run_ai_match(project, db)
            if source != "ai":
                # Don't notify off a low-confidence success-score fallback —
                # wait for a real AI match before telling anyone they're matched.
                logger.info("Skipping auto-match notifications for project %s — AI service unavailable.", project_id)
                return

            for m in matches[:AUTO_MATCH_NOTIFY_TOP_K]:
                if not m.user_id:
                    continue
                try:
                    score_text = f" ({m.ai_match_score:.0f}% match)" if m.ai_match_score is not None else ""
                    notify(
                        db=db,
                        user_id=m.user_id,
                        type=models.NotificationType.match,
                        title="You've been matched with a new project!",
                        body=f"'{project.title}' looks like a great fit for your skills{score_text}.",
                        entity_id=project.project_id,
                    )
                except Exception as exc:
                    logger.warning("Failed to notify freelancer user_id=%s of match on project %s: %s", m.user_id, project_id, exc)

        except Exception as exc:
            logger.error("Automatic AI matching failed for project %s: %s", project_id, exc)
