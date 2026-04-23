"""
schema.py — Request & Response Shapes
=======================================
Phase 1-3 fixes (→ 10/10):
  - Added created_at to all response schemas that were missing it
  - Added cover_letter to ProposalCreate / ProposalResponse
  - Added title, description, due_date to MilestoneCreate / MilestoneResponse
  - Fixed EscrowResponse to include released_amount and funded_at
  - Added WalletTransactionResponse.description + created_at
  - Added FileResponse.file_size_kb + created_at
  - Added ReviewCreate, ReviewResponse (model existed, no schema/router existed)
  - Added FreelancerSkillUpdate (add/remove freelancer skills)
  - Added FreelancerSearchResult (for GET /freelancers/search)
  - Added full DisputeResponse with all fields

Phase 4 additions:
  - AIMatchResponse, AIPricingResponse, AIScoreResponse
  - DisputeResolveRequest
  - VerificationResponse, VerificationReviewRequest
  - MessageCreate, ChatMessageResponse, ConversationSummary

Phase 5 additions:
  - NotificationResponse, NotificationSummary
  - NotificationPreferences (for future webhook/email config)
  - WebSocket message envelopes (WSMessageOut, WSMessageIn)
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

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

class DisputeStatus(str, Enum):
    open     = "open"
    resolved = "resolved"

class VerificationStatus(str, Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"

class NotificationType(str, Enum):
    message      = "message"
    proposal     = "proposal"
    contract     = "contract"
    milestone    = "milestone"
    dispute      = "dispute"
    verification = "verification"
    review       = "review"
    payment      = "payment"
    system       = "system"


# ═══════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════

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

class MFAConfirmRequest(BaseModel):
    totp_code: str

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


# ═══════════════════════════════════════════════════
#  USER & PROFILES
# ═══════════════════════════════════════════════════

class UserResponse(BaseModel):
    user_id:     int = Field(validation_alias="id")
    email:       str
    role:        UserRole
    status:      UserStatus
    mfa_enabled: bool
    created_at:  datetime
    model_config = {"from_attributes": True, "populate_by_name": True}

class FreelancerProfileResponse(BaseModel):
    freelancer_id:  int
    bio:            Optional[str]
    hourly_rate:    Optional[float]
    success_score:  float
    wallet_balance: float
    portfolio_file: Optional[str]
    skills:         List[str] = []

    @classmethod
    def from_profile(cls, profile) -> "FreelancerProfileResponse":
        skill_names = [fs.skill.name for fs in (profile.skills or []) if fs.skill]
        return cls(
            freelancer_id  = profile.freelancer_id,
            bio            = profile.bio,
            hourly_rate    = profile.hourly_rate,
            success_score  = profile.success_score or 0.0,
            wallet_balance = profile.wallet_balance or 0.0,
            portfolio_file = profile.portfolio_file,
            skills         = skill_names,
        )
    model_config = {"from_attributes": True}

class FreelancerProfileUpdate(BaseModel):
    bio:         Optional[str]   = None
    hourly_rate: Optional[float] = None

class FreelancerSkillUpdate(BaseModel):
    """Body for POST/DELETE /users/me/skills"""
    skill_names: List[str]

class ClientProfileResponse(BaseModel):
    client_id:    int
    company_name: Optional[str]
    model_config = {"from_attributes": True}

class ClientProfileUpdate(BaseModel):
    company_name: Optional[str] = None

class UserSearchResult(BaseModel):
    user_id: int = Field(validation_alias="id")
    email:   str
    role:    UserRole
    model_config = {"from_attributes": True, "populate_by_name": True}

class FreelancerSearchResult(BaseModel):
    """Used in GET /freelancers/search and AI match responses"""
    freelancer_id:  int
    user_id:        int
    email:          str
    bio:            Optional[str]
    hourly_rate:    Optional[float]
    success_score:  float
    skills:         List[str] = []
    ai_match_score: Optional[float] = None


# ═══════════════════════════════════════════════════
#  ADMIN
# ═══════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════
#  PROJECTS
# ═══════════════════════════════════════════════════

class ProjectCreate(BaseModel):
    title:           str
    description:     Optional[str] = None
    budget:          float
    required_skills: Optional[List[str]] = None
    sub_category:    Optional[str] = None   # AI primary output (e.g. "Logo Design")
    category:        Optional[str] = None   # AI secondary output (e.g. "Design")

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
    title:           Optional[str]       = None
    description:     Optional[str]       = None
    budget:          Optional[float]     = None
    required_skills: Optional[List[str]] = None
    sub_category:    Optional[str]       = None
    category:        Optional[str]       = None

    @field_validator("budget")
    @classmethod
    def budget_minimum(cls, v: float) -> float:
        if v is not None and v < 10.0:
            raise ValueError("Budget must be at least $10.00.")
        return v

class ProjectResponse(BaseModel):
    project_id:      int
    client_id:       int
    title:           str
    description:     Optional[str]
    budget:          float
    sub_category:    Optional[str] = None
    category:        Optional[str] = None
    status:          ProjectStatus
    required_skills: List[str] = []
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════
#  PROPOSALS
# ═══════════════════════════════════════════════════

class ProposalCreate(BaseModel):
    project_id:   int
    bid_amount:   float
    cover_letter: Optional[str] = None

    @field_validator("bid_amount")
    @classmethod
    def bid_positive(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError("Bid amount must be at least $1.00.")
        return v

class ProposalResponse(BaseModel):
    proposal_id:        int
    project_id:         int
    freelancer_id:      int
    bid_amount:         float
    cover_letter:       Optional[str]
    ai_relevance_score: Optional[float]
    status:             ProposalStatus
    created_at:         datetime
    model_config = {"from_attributes": True}

class ProposalStatusUpdate(BaseModel):
    action: str  # "accept" or "reject"

class ProposalStatusUpdateResponse(BaseModel):
    proposal_id: int
    status:      ProposalStatus
    contract_id: Optional[int]
    message:     str


# ═══════════════════════════════════════════════════
#  CONTRACTS
# ═══════════════════════════════════════════════════

class ContractResponse(BaseModel):
    contract_id:   int
    project_id:    int
    freelancer_id: int
    status:        ContractStatus
    created_at:    datetime
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════
#  MILESTONES
# ═══════════════════════════════════════════════════

class MilestoneCreate(BaseModel):
    title:       Optional[str]      = None
    description: Optional[str]      = None
    amount:      float
    due_date:    Optional[datetime] = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Milestone amount must be greater than $0.")
        return v

class MilestoneResponse(BaseModel):
    milestone_id: int
    contract_id:  int
    title:        Optional[str]
    description:  Optional[str]
    amount:       float
    status:       MilestoneStatus
    due_date:     Optional[datetime]
    created_at:   datetime
    model_config = {"from_attributes": True}

class MilestoneStatusUpdate(BaseModel):
    status: MilestoneStatus


# ═══════════════════════════════════════════════════
#  ESCROW & PAYMENTS
# ═══════════════════════════════════════════════════

class EscrowFundRequest(BaseModel):
    payment_reference: str
    amount:            Optional[float] = None

class EscrowResponse(BaseModel):
    escrow_id:         int
    contract_id:       int
    amount:            float
    released_amount:   float = 0.0
    status:            EscrowStatus
    funded_at:         Optional[datetime] = None
    payment_reference: Optional[str]      = None
    message:           Optional[str]      = None
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════
#  WALLET
# ═══════════════════════════════════════════════════

class WalletBalanceResponse(BaseModel):
    freelancer_id:  int
    wallet_balance: float

class WalletWithdrawRequest(BaseModel):
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
    description:    Optional[str]
    created_at:     datetime
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════
#  FILES
# ═══════════════════════════════════════════════════

class FileResponse(BaseModel):
    file_id:       int
    project_id:    int
    uploader_id:   int
    file_path:     str
    original_name: Optional[str]     = None
    file_size_kb:  Optional[int]     = None
    created_at:    Optional[datetime] = None
    message:       Optional[str]     = None
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════
#  REVIEWS
# ═══════════════════════════════════════════════════

class ReviewCreate(BaseModel):
    rating:  int
    comment: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def rating_range(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Rating must be between 1 and 5.")
        return v

class ReviewResponse(BaseModel):
    review_id:     int
    project_id:    int
    freelancer_id: int
    client_id:     int
    rating:        int
    comment:       Optional[str]
    created_at:    datetime
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════
#  DISPUTES
# ═══════════════════════════════════════════════════

class DisputeResponse(BaseModel):
    dispute_id:      int
    contract_id:     int
    opened_by:       Optional[int]
    reason:          Optional[str]
    status:          DisputeStatus
    resolution_note: Optional[str]
    resolved_by:     Optional[int]
    resolved_at:     Optional[datetime]
    created_at:      datetime
    model_config = {"from_attributes": True}

class DisputeResolveRequest(BaseModel):
    resolution:       str            # "release_to_freelancer" | "refund_to_client" | "split"
    note:             str
    split_percentage: Optional[float] = None

    @field_validator("resolution")
    @classmethod
    def valid_resolution(cls, v: str) -> str:
        allowed = {"release_to_freelancer", "refund_to_client", "split"}
        if v not in allowed:
            raise ValueError(f"resolution must be one of: {', '.join(allowed)}")
        return v


# ═══════════════════════════════════════════════════
#  AI SCHEMAS (Phase 4)
# ═══════════════════════════════════════════════════

class AIMatchResponse(BaseModel):
    project_id: int
    matches:    List[FreelancerSearchResult]
    source:     str = "ai"

class AIPricingResponse(BaseModel):
    project_id:    int
    suggested_min: float
    suggested_max: float
    reasoning:     Optional[str] = None
    source:        str = "ai"

class AIScoreResponse(BaseModel):
    proposal_id:        int
    ai_relevance_score: float
    reasoning:          Optional[str] = None


# ═══════════════════════════════════════════════════
#  VERIFICATION (Phase 4)
# ═══════════════════════════════════════════════════

class VerificationResponse(BaseModel):
    verification_id: int
    user_id:         int
    document_type:   Optional[str]
    document_path:   Optional[str]
    status:          VerificationStatus
    rejection_note:  Optional[str]
    reviewed_by:     Optional[int]
    reviewed_at:     Optional[datetime]
    created_at:      datetime
    model_config = {"from_attributes": True}

class VerificationReviewRequest(BaseModel):
    action:         str
    rejection_note: Optional[str] = None

    @field_validator("action")
    @classmethod
    def valid_action(cls, v: str) -> str:
        if v not in ("approve", "reject"):
            raise ValueError("action must be 'approve' or 'reject'.")
        return v


# ═══════════════════════════════════════════════════
#  MESSAGES / CHAT (Phase 4 + Phase 5 enhancements)
# ═══════════════════════════════════════════════════

class MessageCreate(BaseModel):
    receiver_id: int
    content:     str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content cannot be empty.")
        return v.strip()

class ChatMessageResponse(BaseModel):
    message_id:  int
    sender_id:   int
    receiver_id: int
    content:     str
    is_read:     bool
    sent_at:     datetime
    model_config = {"from_attributes": True}

class ConversationSummary(BaseModel):
    other_user_id:    int
    other_user_email: str
    last_message:     str
    last_message_at:  datetime
    unread_count:     int


# ═══════════════════════════════════════════════════
#  NOTIFICATIONS  ✅ Phase 5
# ═══════════════════════════════════════════════════

class NotificationResponse(BaseModel):
    """
    Single notification returned from GET /notifications or pushed over WebSocket.
    """
    notification_id: int
    user_id:         int
    type:            NotificationType
    title:           str
    body:            Optional[str]
    entity_id:       Optional[int]     # e.g. contract_id the notification relates to
    is_read:         bool
    created_at:      datetime
    model_config = {"from_attributes": True}

class NotificationSummary(BaseModel):
    """
    Returned by GET /notifications/unread-count — fast badge counter.
    """
    unread_count: int

class NotificationMarkReadRequest(BaseModel):
    """Body for PATCH /notifications/read — mark a list of IDs as read."""
    notification_ids: List[int]


# ═══════════════════════════════════════════════════
#  WEBSOCKET MESSAGE ENVELOPES  ✅ Phase 5
# ═══════════════════════════════════════════════════

class WSIncomingMessage(BaseModel):
    """
    JSON envelope the CLIENT sends over the WebSocket.

    Supported types:
      - "ping"           → keepalive, server replies with "pong"
      - "chat_message"   → send a chat message; payload = {"receiver_id": int, "content": str}
      - "mark_read"      → mark messages read; payload = {"other_user_id": int}
    """
    type:    str
    payload: Optional[Any] = None

class WSOutgoingMessage(BaseModel):
    """
    JSON envelope the SERVER pushes to the client over WebSocket.

    Supported types:
      - "pong"              → keepalive reply
      - "chat_message"      → new message delivered in real-time
      - "notification"      → any new notification (proposal, contract, etc.)
      - "error"             → error from a bad incoming message
    """
    type:    str
    payload: Optional[Any] = None


# ═══════════════════════════════════════════════════
#  GENERIC
# ═══════════════════════════════════════════════════

class MessageResponse(BaseModel):
    message: str