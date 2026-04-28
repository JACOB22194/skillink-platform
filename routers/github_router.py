"""
github_router.py  (updated)
────────────────────────────
Adds storage of all GitHub-parsed fields needed by the recommender:
professional_title, github_score, github_url, top_languages,
github_stats, profile_text, sub_category_tags.

The /parse endpoint is unchanged from the caller's perspective —
same request shape, same response — we just store more.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import httpx, json, os

from auth import require_freelancer
from db   import get_db
import models
from skill_subcategory_map import skills_to_subcategories, build_profile_text

router = APIRouter(prefix="/github", tags=["GitHub"])

AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://ai:8000")


class GitHubParseRequest(BaseModel):
    url: str


@router.post("/parse")
def parse_github_profile(
    req: GitHubParseRequest,
    me:  models.User     = Depends(require_freelancer),
    db:  Session         = Depends(get_db),
):
    # ── 1. Call AI service ────────────────────────────────────────────────────
    try:
        with httpx.Client(timeout=120) as client:
            r = client.post(f"{AI_SERVICE_URL}/parse-github", json={"url": req.url})
            r.raise_for_status()
            parsed = r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unreachable: {str(e)}")

    # ── 2. Fetch freelancer row ───────────────────────────────────────────────
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found.")

    github_stats: dict = parsed.get("github_stats", {})

    # ── 3. Store basic profile fields ────────────────────────────────────────
    if parsed.get("summary"):
        freelancer.bio = parsed["summary"]

    if parsed.get("title"):
        freelancer.professional_title = parsed["title"]

    freelancer.github_score = parsed.get("score", 0)
    freelancer.github_url   = github_stats.get("profile_url", req.url)

    # Store full github_stats as JSON (stars, repos, followers, languages)
    freelancer.top_languages = json.dumps(github_stats.get("top_languages", []))
    freelancer.github_stats  = json.dumps({
        "username":       github_stats.get("username", ""),
        "public_repos":   github_stats.get("public_repos", 0),
        "followers":      github_stats.get("followers", 0),
        "total_stars":    github_stats.get("total_stars", 0),
        "account_created":github_stats.get("account_created", ""),
        "top_languages":  github_stats.get("top_languages", []),
        "avatar_url":     github_stats.get("avatar_url", ""),
        "name":           github_stats.get("name", ""),
        "location":       github_stats.get("location", ""),
        "website":        github_stats.get("website", ""),
        "experience":     parsed.get("experience", []),
        "suggestions":    parsed.get("suggestions", []),
    })

    # ── 4. Store skills ───────────────────────────────────────────────────────
    if parsed.get("skills"):
        existing_ids = {fs.skill_id for fs in freelancer.skills}
        for skill_name in parsed["skills"]:
            skill_name = skill_name.strip()
            if not skill_name:
                continue
            skill = db.query(models.Skill).filter(
                models.Skill.name == skill_name
            ).first()
            if not skill:
                skill = models.Skill(name=skill_name)
                db.add(skill)
                db.flush()
            if skill.skill_id not in existing_ids:
                db.add(models.FreelancerSkill(
                    freelancer_id=freelancer.freelancer_id,
                    skill_id=skill.skill_id,
                ))
                existing_ids.add(skill.skill_id)

    # ── 5. Build recommender vectors ─────────────────────────────────────────
    freelancer.profile_text = build_profile_text(parsed)

    all_skills    = parsed.get("skills", [])
    top_languages = github_stats.get("top_languages", [])
    sub_cats      = skills_to_subcategories(all_skills, top_languages)
    freelancer.sub_category_tags = json.dumps(sub_cats)

    db.commit()
    db.refresh(freelancer)

    # ── 6. Return full parsed profile (same as before + new fields) ──────────
    return {
        **parsed,
        "stored_sub_categories": sub_cats,
        "profile_completeness": parsed.get("score", 0),
    }


@router.get("/profile")
def get_github_profile(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    """Return the stored GitHub-derived profile for the current freelancer."""
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found.")

    skills = [fs.skill.name for fs in freelancer.skills if fs.skill]
    stored = json.loads(freelancer.github_stats or "{}")

    return {
        "professional_title":  freelancer.professional_title,
        "bio":                 freelancer.bio,
        "github_score":        freelancer.github_score,
        "github_url":          freelancer.github_url,
        "skills":              skills,
        "top_languages":       json.loads(freelancer.top_languages or "[]"),
        "sub_category_tags":   json.loads(freelancer.sub_category_tags or "[]"),
        "github_stats":        stored,
        # flattened for convenience
        "avatar_url":          stored.get("avatar_url", ""),
        "name":                stored.get("name", ""),
        "location":            stored.get("location", ""),
        "website":             stored.get("website", ""),
        "experience":          stored.get("experience", []),
        "suggestions":         stored.get("suggestions", []),
    }
