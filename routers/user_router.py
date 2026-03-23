"""
routers/user_router.py — User Profile & Portfolio Endpoints
=============================================================
GET  /users/me           → see your own account info
GET  /users/me/profile   → see your freelancer or client profile
PUT  /users/me/profile   → edit your profile
POST /users/me/portfolio → upload your portfolio file (freelancers only)
GET  /users/{user_id}    → view any other user (must be logged in)
"""

import os
import uuid
import aiofiles

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_freelancer

router     = APIRouter(prefix="/users", tags=["Users & Profiles"])
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

# Allowed portfolio file types (PDF, images, ZIP, Word docs)
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
    description="Returns your email, role, status, and whether MFA is enabled.",
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
Returns your role-specific profile:
- **Freelancer** → bio, hourly rate, success score, wallet balance, portfolio file
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
        return schema.FreelancerProfileResponse.model_validate(profile)

    elif me.role == models.UserRole.client:
        profile = db.query(models.Client).filter(
            models.Client.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Client profile not found.")
        return schema.ClientProfileResponse.model_validate(profile)

    return {"message": "Admin accounts do not have a separate profile."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PUT /users/me/profile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put(
    "/me/profile",
    summary="Edit my profile",
    description="""
Update your profile. Only fields you include will change.
- **Freelancer**: `bio`, `hourly_rate`
- **Client**: `company_name`
""",
)
def update_my_profile(
    body: dict,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if me.role == models.UserRole.freelancer:
        update  = schema.FreelancerProfileUpdate(**body)
        profile = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Freelancer profile not found.")
        if update.bio         is not None: profile.bio         = update.bio
        if update.hourly_rate is not None: profile.hourly_rate = update.hourly_rate
        db.commit()
        db.refresh(profile)
        return schema.FreelancerProfileResponse.model_validate(profile)

    elif me.role == models.UserRole.client:
        update  = schema.ClientProfileUpdate(**body)
        profile = db.query(models.Client).filter(
            models.Client.user_id == me.id
        ).first()
        if not profile:
            raise HTTPException(404, "Client profile not found.")
        if update.company_name is not None: profile.company_name = update.company_name
        db.commit()
        db.refresh(profile)
        return schema.ClientProfileResponse.model_validate(profile)

    raise HTTPException(400, "Admin accounts do not have a profile to edit.")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /users/me/portfolio
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/me/portfolio",
    response_model=schema.MessageResponse,
    summary="Upload your portfolio file",
    description="""
Upload your portfolio. Accepted file types: **PDF, JPEG, PNG, ZIP, Word doc**.
Maximum size: **10 MB**.

The path is saved in your freelancer profile.
You can access it at `/uploads/portfolios/<filename>`.

**Freelancers only.**
""",
)
async def upload_portfolio(
    file: UploadFile  = File(..., description="Portfolio file (max 10MB)"),
    me:   models.User = Depends(require_freelancer),
    db:   Session     = Depends(get_db),
):
    # 1. Check file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            400,
            f"File type '{file.content_type}' is not allowed. "
            "Use PDF, JPEG, PNG, ZIP, or a Word document.",
        )

    # 2. Read content and check size
    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Maximum is {MAX_SIZE_MB} MB.")

    # 3. Save with a unique random filename (prevents overwriting)
    ext      = (file.filename or "file").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "portfolios")
    os.makedirs(save_dir, exist_ok=True)

    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    # 4. Save the path in the freelancer profile
    profile = db.query(models.Freelancer).filter(
        models.Freelancer.user_id == me.id
    ).first()
    if not profile:
        raise HTTPException(404, "Freelancer profile not found.")

    profile.portfolio_file = f"/uploads/portfolios/{filename}"
    db.commit()

    return {"message": f"Portfolio uploaded. Access it at: {profile.portfolio_file}"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /users/{user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/{user_id}",
    response_model=schema.UserResponse,
    summary="View any user's info",
    description="Returns basic info for any active user. You must be logged in.",
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