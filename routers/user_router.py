"""
routers/user_router.py — User Profile, Portfolio & Skills
===========================================================
GET    /users/me                → your account info
GET    /users/me/profile        → your role-specific profile (with skills)
PUT    /users/me/profile        → edit your profile (typed body, not raw dict)
POST   /users/me/portfolio      → upload portfolio file (freelancers)
POST   /users/me/skills         → add skills to your profile (freelancers) ✅ NEW
DELETE /users/me/skills         → remove skills from your profile (freelancers) ✅ NEW
GET    /freelancers/search      → search freelancers by skill/rate/score ✅ NEW
GET    /users/{user_id}         → view any user's public info

PHASE 3 FIXES:
  - PUT /users/me/profile now uses typed schemas (not raw dict)
  - GET /users/me/profile now returns skills list for freelancers
  - Added freelancer skill management endpoints
  - Added freelancer search endpoint
"""

import os
import uuid
import aiofiles

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List

from db import get_db
import models
import schema
from auth import get_current_user, require_freelancer

router     = APIRouter(prefix="/users", tags=["Users & Profiles"])
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

ALLOWED_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_SIZE_MB = 10


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/me
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/me",
    response_model=schema.UserResponse,
    summary="Get my account info",
)
def get_me(me: models.User = Depends(get_current_user)):
    return me


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/me/profile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/me/profile",
    summary="Get my profile",
    description="""
- **Freelancer** → bio, hourly rate, success score, wallet balance, portfolio file, **skills list**
- **Client** → company name
""",
)
def get_my_profile(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    if me.role == models.UserRole.freelancer:
        profile = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Freelancer profile not found.")
        return schema.FreelancerProfileResponse.from_profile(profile)

    elif me.role == models.UserRole.client:
        profile = db.query(models.Client).filter(
            models.Client.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Client profile not found.")
        return schema.ClientProfileResponse.model_validate(profile)

    return {"message": "Admin accounts do not have a separate profile."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PUT /users/me/profile  — Fixed: typed body
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put(
    "/me/profile",
    summary="Edit my profile",
    description="""
Update your profile. Only included fields will change.
- **Freelancer**: `bio`, `hourly_rate`
- **Client**: `company_name`
""",
)
def update_my_profile(
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
    bio:         Optional[str]   = None,
    hourly_rate: Optional[float] = None,
    company_name: Optional[str]  = None,
):
    if me.role == models.UserRole.freelancer:
        profile = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Freelancer profile not found.")
        if bio         is not None: profile.bio         = bio
        if hourly_rate is not None:
            if hourly_rate < 0:
                raise HTTPException(400, "Hourly rate cannot be negative.")
            profile.hourly_rate = hourly_rate
        db.commit()
        db.refresh(profile)
        return schema.FreelancerProfileResponse.from_profile(profile)

    elif me.role == models.UserRole.client:
        profile = db.query(models.Client).filter(
            models.Client.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Client profile not found.")
        if company_name is not None: profile.company_name = company_name
        db.commit()
        db.refresh(profile)
        return schema.ClientProfileResponse.model_validate(profile)

    raise HTTPException(400, "Admin accounts do not have a profile to edit.")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /users/me/skills  ✅ NEW
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/me/skills",
    response_model=schema.FreelancerProfileResponse,
    summary="Add skills to my profile",
    description="""
**Freelancers only.** Provide a list of skill names to add.
Skills are auto-created if they don't exist yet.
Skills you already have are silently skipped.
""",
)
def add_skills(
    body: schema.FreelancerSkillUpdate,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")

    # Get existing skill IDs for this freelancer to avoid duplicates
    existing_skill_ids = {fs.skill_id for fs in profile.skills}

    for skill_name in body.skill_names:
        skill = db.query(models.Skill).filter(models.Skill.name == skill_name).first()
        if not skill:
            skill = models.Skill(name=skill_name)
            db.add(skill)
            db.flush()

        if skill.skill_id not in existing_skill_ids:
            db.add(models.FreelancerSkill(
                freelancer_id = profile.freelancer_id,
                skill_id      = skill.skill_id,
            ))
            existing_skill_ids.add(skill.skill_id)

    db.commit()
    db.refresh(profile)
    return schema.FreelancerProfileResponse.from_profile(profile)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /users/me/skills  ✅ NEW
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/me/skills",
    response_model=schema.FreelancerProfileResponse,
    summary="Remove skills from my profile",
    description="**Freelancers only.** Provide skill names to remove. Unknown skills are ignored.",
)
def remove_skills(
    body: schema.FreelancerSkillUpdate,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")

    for skill_name in body.skill_names:
        skill = db.query(models.Skill).filter(models.Skill.name == skill_name).first()
        if skill:
            db.query(models.FreelancerSkill).filter(
                models.FreelancerSkill.freelancer_id == profile.freelancer_id,
                models.FreelancerSkill.skill_id      == skill.skill_id,
            ).delete()

    db.commit()
    db.refresh(profile)
    return schema.FreelancerProfileResponse.from_profile(profile)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/me/portfolio  — list items
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/me/portfolio",
    response_model=list[schema.PortfolioItemResponse],
    summary="List your portfolio items (freelancers only)",
)
def list_portfolio(
    me: models.User = Depends(require_freelancer),
    db: Session     = Depends(get_db),
):
    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")
    return db.query(models.PortfolioItem).filter(
        models.PortfolioItem.freelancer_id == profile.freelancer_id
    ).order_by(models.PortfolioItem.created_at.desc()).all()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /users/me/portfolio  — add a link
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class _PortfolioLinkIn(BaseModel):
    title:       str
    url:         str
    description: Optional[str] = None
    type:        str = "link"

@router.post(
    "/me/portfolio",
    response_model=schema.PortfolioItemResponse,
    summary="Add a portfolio link (freelancers only)",
)
def add_portfolio_link(
    body: _PortfolioLinkIn,
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")
    item = models.PortfolioItem(
        freelancer_id = profile.freelancer_id,
        type          = models.PortfolioItemType.link,
        title         = body.title.strip(),
        description   = body.description,
        url           = body.url.strip(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /users/me/portfolio/upload  — upload a file
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/me/portfolio/upload",
    response_model=schema.PortfolioItemResponse,
    summary="Upload a portfolio file (freelancers only)",
    description="Accepted: PDF, JPEG, PNG, ZIP, Word. Max 10 MB.",
)
async def upload_portfolio_file(
    file:  UploadFile = File(..., description="Portfolio file (max 10MB)"),
    title: str        = Form(..., description="Display title for this file"),
    me:    models.User = Depends(require_freelancer),
    db:    Session     = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            400,
            f"File type '{file.content_type}' is not allowed. "
            "Use PDF, JPEG, PNG, ZIP, or Word.",
        )

    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Maximum is {MAX_SIZE_MB} MB.")

    ext      = (file.filename or "file").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "portfolios")
    os.makedirs(save_dir, exist_ok=True)

    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")

    file_path = f"/uploads/portfolios/{filename}"
    item = models.PortfolioItem(
        freelancer_id = profile.freelancer_id,
        type          = models.PortfolioItemType.file,
        title         = title.strip(),
        file_path     = file_path,
        url           = file_path,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /users/me/portfolio/{item_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/me/portfolio/{item_id}",
    response_model=schema.MessageResponse,
    summary="Delete a portfolio item (freelancers only)",
)
def delete_portfolio_item(
    item_id: int,
    me:  models.User = Depends(require_freelancer),
    db:  Session     = Depends(get_db),
):
    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")
    item = db.query(models.PortfolioItem).filter(
        models.PortfolioItem.item_id       == item_id,
        models.PortfolioItem.freelancer_id == profile.freelancer_id,
    ).first()
    if not item:
        raise HTTPException(404, "Portfolio item not found.")
    db.delete(item)
    db.commit()
    return {"message": "Portfolio item deleted."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/search?q=  — must be before /{user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/search",
    response_model=list[schema.UserSearchResult],
    summary="Search users by email (for starting a new conversation)",
)
def search_users(
    q:  str         = Query(..., min_length=1, description="Partial email match"),
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    users = (
        db.query(models.User)
        .filter(
            models.User.id     != me.id,
            models.User.status == models.UserStatus.active,
            models.User.email.ilike(f"%{q}%"),
        )
        .limit(10)
        .all()
    )
    return users


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/{user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/{user_id}",
    response_model=schema.UserResponse,
    summary="View any user's public info",
)
def get_user_by_id(
    user_id: int,
    me:      models.User = Depends(get_current_user),
    db:      Session     = Depends(get_db),
):
    user = db.query(models.User).filter(
        models.User.id     == user_id,
        models.User.status == models.UserStatus.active,
    ).first()
    if not user:
        raise HTTPException(404, "User not found.")
    return user


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /freelancers/search  ✅ NEW
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

freelancer_router = APIRouter(prefix="/freelancers", tags=["Users & Profiles"])

@freelancer_router.get(
    "/search",
    response_model=list[schema.FreelancerSearchResult],
    summary="Search freelancers",
    description="""
Search active freelancers. All filters are optional.

- `skill` → filter by skill name (partial match)
- `min_rate` / `max_rate` → hourly rate range
- `min_score` → minimum success score (0–5)
- `skip` / `limit` → pagination
""",
)
def search_freelancers(
    skill:     Optional[str]   = Query(None, description="Filter by skill name"),
    min_rate:  Optional[float] = Query(None, ge=0),
    max_rate:  Optional[float] = Query(None, ge=0),
    min_score: Optional[float] = Query(None, ge=0, le=5),
    skip:      int             = Query(0,  ge=0),
    limit:     int             = Query(20, ge=1, le=100),
    me:        models.User     = Depends(get_current_user),
    db:        Session         = Depends(get_db),
):
    q = (
        db.query(models.Freelancer)
        .join(models.User, models.User.id == models.Freelancer.user_id)
        .filter(models.User.status == models.UserStatus.active)
    )

    if min_rate  is not None: q = q.filter(models.Freelancer.hourly_rate >= min_rate)
    if max_rate  is not None: q = q.filter(models.Freelancer.hourly_rate <= max_rate)
    if min_score is not None: q = q.filter(models.Freelancer.success_score >= min_score)

    if skill:
        q = (
            q.join(models.FreelancerSkill,
                   models.FreelancerSkill.freelancer_id == models.Freelancer.freelancer_id)
             .join(models.Skill,
                   models.Skill.skill_id == models.FreelancerSkill.skill_id)
             .filter(models.Skill.name.ilike(f"%{skill}%"))
        )

    freelancers = q.order_by(models.Freelancer.success_score.desc()).offset(skip).limit(limit).all()

    results = []
    for f in freelancers:
        user        = db.query(models.User).filter(models.User.id == f.user_id).first()
        skill_names = [fs.skill.name for fs in f.skills if fs.skill]
        results.append(schema.FreelancerSearchResult(
            freelancer_id = f.freelancer_id,
            user_id       = f.user_id,
            email         = user.email if user else "",
            bio           = f.bio,
            hourly_rate   = f.hourly_rate,
            success_score = f.success_score or 0.0,
            skills        = skill_names,
        ))
    return results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /freelancers/user/{user_id}  — Public profile by user ID
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@freelancer_router.get(
    "/user/{user_id}",
    response_model=schema.FreelancerSearchResult,
    summary="Get a freelancer's public profile by user ID",
)
def get_freelancer_by_user(
    user_id: int,
    me:      models.User = Depends(get_current_user),
    db:      Session     = Depends(get_db),
):
    freelancer = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == user_id
    ).first()
    if not freelancer:
        raise HTTPException(404, "Freelancer profile not found.")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found.")
    skill_names = [fs.skill.name for fs in freelancer.skills if fs.skill]
    return schema.FreelancerSearchResult(
        freelancer_id = freelancer.freelancer_id,
        user_id       = user_id,
        email         = user.email,
        bio           = freelancer.bio,
        hourly_rate   = freelancer.hourly_rate,
        success_score = freelancer.success_score or 0.0,
        skills        = skill_names,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/companies/search?q=   ✅ NEW
#  Public endpoint — no auth needed (used on register page)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/companies/search",
    summary="Search existing company names (for registration dropdown)",
    description="Returns up to 10 distinct company names matching the query. No auth required.",
)
def search_companies(
    q:  str     = Query(..., min_length=1, description="Partial company name match"),
    db: Session = Depends(get_db),
):
    results = (
        db.query(models.Client.company_name)
        .filter(
            models.Client.company_name.isnot(None),
            models.Client.company_name != "",
            models.Client.company_name.ilike(f"%{q}%"),
        )
        .distinct()
        .limit(10)
        .all()
    )
    return [{"company_name": row.company_name} for row in results]