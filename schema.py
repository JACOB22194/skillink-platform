"""
schema.py — Request & Response Shapes
======================================
Pydantic models define what data looks like going IN and OUT of the API.

When a request arrives:
  → Pydantic checks it matches the schema
  → If something is wrong (missing field, wrong type) → returns 422 error automatically

When a response goes out:
  → Pydantic converts the database object to clean JSON

NOTE: Your original schema.py had a bug — UserResponse was defined TWICE.
The second definition silently replaced the first. That is fixed here.
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum


# ── Enums (must match models.py exactly) ──────────────────────────────────────

class UserRole(str, Enum):
    freelancer = "freelancer"
    client     = "client"
    admin      = "admin"

class UserStatus(str, Enum):
    active    = "active"
    suspended = "suspended"


# ═════════════════════════════════════════════════════════════════════════════
#  AUTH SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    """Body for POST /auth/register"""
    email:        EmailStr
    password:     str
    role:         UserRole
    company_name: Optional[str] = None   # only needed when role = client

    @field_validator("password")
    @classmethod
    def password_strong_enough(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        return v


class LoginRequest(BaseModel):
    """Body for POST /auth/login"""
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    """What the server returns after a successful login"""
    access_token:  str    # use this on every API call (lasts 30 min)
    refresh_token: str    # use this to get a new access token (lasts 7 days)
    token_type:    str = "bearer"
    role:          str
    user_id:       int


class RefreshRequest(BaseModel):
    """Body for POST /auth/refresh"""
    refresh_token: str


class MFAVerifyRequest(BaseModel):
    """Body for POST /auth/verify-mfa"""
    email:     EmailStr
    totp_code: str       # the 6-digit code shown in Google Authenticator


class MFASetupRequest(BaseModel):
    """Body for POST /auth/mfa/setup"""
    enable: bool         # True = turn MFA on, False = turn MFA off


class ChangePasswordRequest(BaseModel):
    """Body for POST /auth/change-password"""
    current_password: str
    new_password:     str

    @field_validator("new_password")
    @classmethod
    def password_strong_enough(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        return v


# ═════════════════════════════════════════════════════════════════════════════
#  USER & PROFILE SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class UserResponse(BaseModel):
    """What the API returns when showing a user"""
    id:          int
    email:       str
    role:        UserRole
    status:      UserStatus
    mfa_enabled: bool
    created_at:  datetime

    model_config = {"from_attributes": True}


class FreelancerProfileResponse(BaseModel):
    """Freelancer profile details"""
    freelancer_id:  int
    bio:            Optional[str]
    hourly_rate:    Optional[float]
    success_score:  float
    wallet_balance: float
    portfolio_file: Optional[str]

    model_config = {"from_attributes": True}


class FreelancerProfileUpdate(BaseModel):
    """Body for PUT /users/me/profile (when user is a freelancer)"""
    bio:         Optional[str]   = None
    hourly_rate: Optional[float] = None


class ClientProfileResponse(BaseModel):
    """Client profile details"""
    client_id:    int
    company_name: Optional[str]

    model_config = {"from_attributes": True}


class ClientProfileUpdate(BaseModel):
    """Body for PUT /users/me/profile (when user is a client)"""
    company_name: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
#  ADMIN SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class AdminUserItem(BaseModel):
    """A user row as seen by the admin"""
    id:         int
    email:      str
    role:       UserRole
    status:     UserStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class SuspendUserRequest(BaseModel):
    user_id: int


class AdjustTrustScoreRequest(BaseModel):
    user_id: int
    score:   float


class AdminStatsResponse(BaseModel):
    total_users:       int
    total_freelancers: int
    total_clients:     int
    total_projects:    int
    total_proposals:   int
    total_contracts:   int


# ═════════════════════════════════════════════════════════════════════════════
#  GENERIC
# ═════════════════════════════════════════════════════════════════════════════

class MessageResponse(BaseModel):
    """Generic success message"""
    message: str