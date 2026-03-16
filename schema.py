from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum
from datetime import datetime


class UserRole(str, Enum):
    freelancer = "freelancer"
    client     = "client"
    admin      = "admin"


class UserStatus(str, Enum):
    active    = "active"
    suspended = "suspended"


# ── AUTH ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:        EmailStr
    password:     str
    role:         UserRole
    company_name: Optional[str] = None   # only needed if role = client

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str


# ── USER / PROFILE ────────────────────────────────────────────

class UserResponse(BaseModel):
    user_id: int
    email:   str
    role:    str
    status:  str

    class Config:
        from_attributes = True

class FreelancerProfileUpdate(BaseModel):
    bio:         Optional[str]   = None
    hourly_rate: Optional[float] = None


# ── ADMIN ─────────────────────────────────────────────────────

class SuspendUserRequest(BaseModel):
    user_id: int

class AdjustTrustScoreRequest(BaseModel):
    user_id: int
    score:   float


# Response schemas
class UserResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    status: UserStatus
    created_at: datetime

    class Config:
        from_attributes = True  # Allows conversion from SQLAlchemy models