"""
schema.py — Request & Response Shapes (Phase 3 Update)
========================================================
All Pydantic schemas for the entire API.

Phase 3 additions:
  - ProjectCreate, ProjectResponse, ProjectUpdate
  - ProposalCreate, ProposalResponse, ProposalStatusUpdate, ProposalStatusUpdateResponse
  - ContractResponse
  - MilestoneCreate, MilestoneResponse, MilestoneStatusUpdate
  - EscrowFundRequest, EscrowResponse
  - WalletBalanceResponse, WalletWithdrawRequest, WalletTransactionResponse
  - FileResponse
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
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

class ProjectStatus(str, Enum):
    open        = "open"
    in_progress = "in_progress"
    completed   = "completed"

class ProposalStatus(str, Enum):
    pending  = "pending"
    accepted = "accepted"
    rejected = "rejected"

class ContractStatus(str, Enum):
    active    = "active"
    completed = "completed"
    disputed  = "disputed"

class MilestoneStatus(str, Enum):
    pending  = "pending"
    approved = "approved"
    paid     = "paid"

class EscrowStatus(str, Enum):
    held     = "held"
    released = "released"

class TransactionType(str, Enum):
    deposit  = "deposit"
    withdraw = "withdraw"


# ═════════════════════════════════════════════════════════════════════════════
#  AUTH SCHEMAS (unchanged from Phase 2)
# ═════════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    email:        EmailStr
    password:     str
    role:         UserRole
    company_name: Optional[str] = None

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
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    role:          str
    user_id:       int


class RefreshRequest(BaseModel):
    refresh_token: str


class MFAVerifyRequest(BaseModel):
    email:     EmailStr
    totp_code: str


class MFASetupRequest(BaseModel):
    enable: bool


class ChangePasswordRequest(BaseModel):
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
#  USER & PROFILE SCHEMAS (unchanged from Phase 2)
# ═════════════════════════════════════════════════════════════════════════════

class UserResponse(BaseModel):
    id:          int
    email:       str
    role:        UserRole
    status:      UserStatus
    mfa_enabled: bool
    created_at:  datetime
    model_config = {"from_attributes": True}


class FreelancerProfileResponse(BaseModel):
    freelancer_id:  int
    bio:            Optional[str]
    hourly_rate:    Optional[float]
    success_score:  float
    wallet_balance: float
    portfolio_file: Optional[str]
    model_config = {"from_attributes": True}


class FreelancerProfileUpdate(BaseModel):
    bio:         Optional[str]   = None
    hourly_rate: Optional[float] = None


class ClientProfileResponse(BaseModel):
    client_id:    int
    company_name: Optional[str]
    model_config = {"from_attributes": True}


class ClientProfileUpdate(BaseModel):
    company_name: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
#  ADMIN SCHEMAS (unchanged from Phase 2)
# ═════════════════════════════════════════════════════════════════════════════

class AdminUserItem(BaseModel):
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
#  PROJECT SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class ProjectCreate(BaseModel):
    """Body for POST /projects"""
    title:           str
    description:     Optional[str] = None
    budget:          float
    required_skills: Optional[List[str]] = None

    @field_validator("budget")
    @classmethod
    def budget_minimum(cls, v: float) -> float:
        if v < 10.0:
            raise ValueError("Budget must be at least $10.00.")
        return v

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty.")
        return v.strip()


class ProjectUpdate(BaseModel):
    """Body for PUT /projects/{id} — all fields optional"""
    title:           Optional[str]        = None
    description:     Optional[str]        = None
    budget:          Optional[float]      = None
    required_skills: Optional[List[str]]  = None

    @field_validator("budget")
    @classmethod
    def budget_minimum(cls, v: float) -> float:
        if v is not None and v < 10.0:
            raise ValueError("Budget must be at least $10.00.")
        return v


class ProjectResponse(BaseModel):
    """What the API returns for a project"""
    project_id:      int
    client_id:       int
    title:           str
    description:     Optional[str]
    budget:          float
    status:          ProjectStatus
    required_skills: List[str] = []
    model_config = {"from_attributes": True}


# ═════════════════════════════════════════════════════════════════════════════
#  PROPOSAL SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class ProposalCreate(BaseModel):
    """Body for POST /proposals"""
    project_id: int
    bid_amount: float

    @field_validator("bid_amount")
    @classmethod
    def bid_minimum(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError("Bid amount must be at least $1.00.")
        return v


class ProposalResponse(BaseModel):
    proposal_id:        int
    project_id:         int
    freelancer_id:      int
    bid_amount:         float
    ai_relevance_score: Optional[float]
    status:             ProposalStatus
    model_config = {"from_attributes": True}


class ProposalStatusUpdate(BaseModel):
    """Body for PUT /proposals/{id}/status"""
    action: str  # "accept" or "reject"


class ProposalStatusUpdateResponse(BaseModel):
    proposal_id: int
    status:      ProposalStatus
    contract_id: Optional[int]
    message:     str


# ═════════════════════════════════════════════════════════════════════════════
#  CONTRACT SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class ContractResponse(BaseModel):
    contract_id:   int
    project_id:    int
    freelancer_id: int
    status:        ContractStatus
    model_config = {"from_attributes": True}


# ═════════════════════════════════════════════════════════════════════════════
#  MILESTONE SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class MilestoneCreate(BaseModel):
    """Body for POST /contracts/{id}/milestones"""
    amount: float

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Milestone amount must be greater than $0.")
        return v


class MilestoneResponse(BaseModel):
    milestone_id: int
    contract_id:  int
    amount:       float
    status:       MilestoneStatus
    model_config = {"from_attributes": True}


class MilestoneStatusUpdate(BaseModel):
    """Body for PUT /milestones/{id}/status"""
    status: MilestoneStatus


# ═════════════════════════════════════════════════════════════════════════════
#  ESCROW & PAYMENT SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class EscrowFundRequest(BaseModel):
    """Body for POST /escrow/fund/{contract_id}"""
    payment_reference: str  # PayPal/Stripe transaction ID (or "SANDBOX-xxx" for testing)
    amount:            Optional[float] = None  # Override escrow amount (optional)


class EscrowResponse(BaseModel):
    escrow_id:         int
    contract_id:       int
    amount:            float
    status:            EscrowStatus
    payment_reference: Optional[str] = None
    message:           Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
#  WALLET SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class WalletBalanceResponse(BaseModel):
    freelancer_id:  int
    wallet_balance: float


class WalletWithdrawRequest(BaseModel):
    """Body for POST /wallet/withdraw"""
    amount: float

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Withdrawal amount must be greater than $0.")
        return v


class WalletTransactionResponse(BaseModel):
    transaction_id: int
    freelancer_id:  int
    amount:         float
    type:           TransactionType
    model_config = {"from_attributes": True}


# ═════════════════════════════════════════════════════════════════════════════
#  FILE SCHEMAS  (Phase 3)
# ═════════════════════════════════════════════════════════════════════════════

class FileResponse(BaseModel):
    file_id:       int
    project_id:    int
    uploader_id:   int
    file_path:     str
    original_name: Optional[str] = None
    message:       Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
#  GENERIC
# ═════════════════════════════════════════════════════════════════════════════

class MessageResponse(BaseModel):
    message: str