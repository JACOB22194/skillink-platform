from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import httpx
import os

from auth import require_freelancer
from db import get_db
import models

router = APIRouter(prefix="/github", tags=["GitHub"])

AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://ai:8000")


class GitHubParseRequest(BaseModel):
    url: str


@router.post("/parse")
def parse_github_profile(
    req: GitHubParseRequest,
    me:  models.User = Depends(require_freelancer),
    db:  Session     = Depends(get_db),
):
    try:
        with httpx.Client(timeout=60) as client:
            r = client.post(f"{AI_SERVICE_URL}/parse-github", json={"url": req.url})
            r.raise_for_status()
            parsed = r.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unreachable: {str(e)}")

    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer profile not found.")

    if parsed.get("summary"):
        freelancer.bio = parsed["summary"]

    if parsed.get("skills"):
        existing_ids = {fs.skill_id for fs in freelancer.skills}
        for skill_name in parsed["skills"]:
            skill_name = skill_name.strip()
            if not skill_name:
                continue
            skill = db.query(models.Skill).filter(models.Skill.name == skill_name).first()
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

    db.commit()
    return parsed
