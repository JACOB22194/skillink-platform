"""
models.py — Database Tables
============================
Each class here = one table in PostgreSQL.
SQLAlchemy reads these classes and creates the actual tables.

Phase fixes (1-3 → 10/10):
  - Added created_at timestamps to ALL tables that were missing them
    (milestones, escrow, payments, files, wallet_transactions, disputes,
     messages, reviews, verification, system_logs)
  - Added description field to Milestone (for tracking what work is expected)
  - Added title field to Milestone
  - Added resolution_note to Dispute (admin fills this when resolving)
  - Added resolved_at to Dispute
  - Added rating validator comment (1-5)
  - Added released_amount to Escrow (track partial releases)
  - Added original_name to File (store the original filename)
  - Added WalletTransaction created_at

Phase 5 additions:
  - Notification table (in-app notifications with type, title, body, read flag)
  - WebSocket connection tracking is stateful (in-memory), not stored in DB
"""

from sqlalchemy import (
    Column, Integer, SmallInteger, String, Text,
    Float, DateTime, Enum, ForeignKey, Boolean, Index
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
from db import Base
import enum


# ─────────────────────────────────────────
#  ENUMS — allowed values for specific columns
# ─────────────────────────────────────────

class UserRole(str, enum.Enum):
    freelancer = "freelancer"
    client     = "client"
    admin      = "admin"

class UserStatus(str, enum.Enum):
    unverified = "unverified"
    active    = "active"
    suspended = "suspended"

class ProjectStatus(str, enum.Enum):
    open        = "open"
    in_progress = "in_progress"
    completed   = "completed"

class ProposalStatus(str, enum.Enum):
    pending  = "pending"
    accepted = "accepted"
    rejected = "rejected"

class ContractStatus(str, enum.Enum):
    active    = "active"
    completed = "completed"
    disputed  = "disputed"

class MilestoneStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    paid     = "paid"

class EscrowStatus(str, enum.Enum):
    held     = "held"
    released = "released"

class DisputeStatus(str, enum.Enum):
    open     = "open"
    resolved = "resolved"

class VerificationStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"

class TransactionType(str, enum.Enum):
    deposit  = "deposit"
    withdraw = "withdraw"

class NotificationType(str, enum.Enum):
    """
    Categorises every notification so the frontend can render the right icon.
    """
    message          = "message"           # New chat message received
    proposal         = "proposal"          # New proposal on your project / your proposal was accepted/rejected
    contract         = "contract"          # Contract created / completed / disputed
    milestone        = "milestone"         # Milestone approved or paid
    dispute          = "dispute"           # Dispute opened or resolved
    verification     = "verification"      # Your verification was approved/rejected
    review           = "review"            # You received a new review
    payment          = "payment"           # Wallet credited
    system           = "system"            # Generic platform announcements


# ─────────────────────────────────────────
#  TABLE: users
# ─────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id          = Column(Integer, primary_key=True, index=True)
    email       = Column(String(255), unique=True, nullable=False, index=True)
    password    = Column(String(255), nullable=False)
    role        = Column(Enum(UserRole), nullable=False, index=True)
    status      = Column(Enum(UserStatus), default=UserStatus.active, index=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret  = Column(String(64), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    freelancer        = relationship("Freelancer",    back_populates="user", uselist=False, cascade="all, delete")
    client            = relationship("Client",        back_populates="user", uselist=False, cascade="all, delete")
    trust_scores      = relationship("TrustScore",    back_populates="user", cascade="all, delete")
    verification      = relationship("Verification",  back_populates="user", uselist=False,
                                      foreign_keys="Verification.user_id", cascade="all, delete")
    system_logs       = relationship("SystemLog",     back_populates="performed_by_user", cascade="all, delete")
    sent_messages     = relationship("Message",       foreign_keys="Message.sender_id",
                                     back_populates="sender", cascade="all, delete")
    received_messages = relationship("Message",       foreign_keys="Message.receiver_id",
                                     back_populates="receiver", cascade="all, delete")
    notifications     = relationship("Notification",  back_populates="user",    # ✅ Phase 5
                                     foreign_keys="Notification.user_id", cascade="all, delete")
    subscription = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete")


# ─────────────────────────────────────────
#  TABLE: freelancers
# ─────────────────────────────────────────

class Freelancer(Base):
    __tablename__ = "freelancers"

    freelancer_id      = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    bio                = Column(Text)
    hourly_rate        = Column(Float, index=True)
    success_score      = Column(Float, default=0.0, index=True)
    wallet_balance     = Column(Float, default=0.0)
    portfolio_file     = Column(String(500), nullable=True)
    # Recommender fields (populated by POST /github/parse)
    professional_title = Column(String(120), nullable=True)
    github_score       = Column(SmallInteger, default=0, index=True)
    github_url         = Column(String(255), nullable=True)
    top_languages      = Column(Text, nullable=True)   # JSON list
    github_stats       = Column(Text, nullable=True)   # JSON object
    profile_text       = Column(Text, nullable=True)   # TF-IDF document
    sub_category_tags  = Column(Text, nullable=True)   # JSON list

    user                = relationship("User",              back_populates="freelancer")
    proposals           = relationship("Proposal",          back_populates="freelancer", cascade="all, delete")
    contracts           = relationship("Contract",          back_populates="freelancer", cascade="all, delete")
    reviews             = relationship("Review",            back_populates="freelancer", cascade="all, delete")
    skills              = relationship("FreelancerSkill",   back_populates="freelancer", cascade="all, delete")
    wallet_transactions = relationship("WalletTransaction", back_populates="freelancer", cascade="all, delete")
    recommendations     = relationship("Recommendation",    back_populates="freelancer", cascade="all, delete")


# ─────────────────────────────────────────
#  TABLE: clients
# ─────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"

    client_id    = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    company_name = Column(String(255))

    user     = relationship("User",    back_populates="client")
    projects = relationship("Project", back_populates="client", cascade="all, delete")


# ─────────────────────────────────────────
#  TABLE: skill_taxonomy  (master list for AI service)
# ─────────────────────────────────────────

class SkillTaxonomy(Base):
    __tablename__ = "skill_taxonomy"

    skill_id     = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), unique=True, nullable=False, index=True)
    category     = Column(String(100), nullable=False, index=True)
    description  = Column(Text, nullable=True)


# ─────────────────────────────────────────
#  TABLE: skills  (used by projects and freelancers)
# ─────────────────────────────────────────

class Skill(Base):
    __tablename__ = "skills"

    skill_id = Column(Integer, primary_key=True, index=True)
    name     = Column(String(100), unique=True, nullable=False, index=True)

    freelancer_skills = relationship("FreelancerSkill", back_populates="skill")
    project_skills    = relationship("ProjectSkill",    back_populates="skill")


# ─────────────────────────────────────────
#  TABLE: freelancer_skills (junction)
# ─────────────────────────────────────────

class FreelancerSkill(Base):
    __tablename__ = "freelancer_skills"

    freelancer_id = Column(Integer, ForeignKey("freelancers.freelancer_id"), primary_key=True, index=True)
    skill_id      = Column(Integer, ForeignKey("skills.skill_id"),           primary_key=True, index=True)

    freelancer = relationship("Freelancer", back_populates="skills")
    skill      = relationship("Skill",      back_populates="freelancer_skills")


# ─────────────────────────────────────────
#  TABLE: projects
# ─────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    project_id   = Column(Integer, primary_key=True, index=True)
    client_id    = Column(Integer, ForeignKey("clients.client_id"), nullable=False, index=True)
    title        = Column(String(255), nullable=False)
    description  = Column(Text)
    budget       = Column(Float, index=True)
    sub_category = Column(String(150), nullable=True, index=True)   # AI primary output (e.g. "Logo Design")
    category     = Column(String(150), nullable=True, index=True)   # AI secondary output via sub_to_cat lookup (e.g. "Design")
    status       = Column(Enum(ProjectStatus), default=ProjectStatus.open, index=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    client          = relationship("Client",         back_populates="projects")
    proposals       = relationship("Proposal",       back_populates="project", cascade="all, delete")
    contracts       = relationship("Contract",       back_populates="project", cascade="all, delete")
    skills          = relationship("ProjectSkill",   back_populates="project", cascade="all, delete")
    files           = relationship("File",           back_populates="project", cascade="all, delete")
    reviews         = relationship("Review",         back_populates="project", cascade="all, delete")
    ai_pricing      = relationship("AIPricing",      back_populates="project", uselist=False, cascade="all, delete")
    recommendations = relationship("Recommendation", back_populates="project", cascade="all, delete")


# ─────────────────────────────────────────
#  TABLE: project_skills (junction)
# ─────────────────────────────────────────

class ProjectSkill(Base):
    __tablename__ = "project_skills"

    project_id = Column(Integer, ForeignKey("projects.project_id"), primary_key=True, index=True)
    skill_id   = Column(Integer, ForeignKey("skills.skill_id"),     primary_key=True, index=True)

    project = relationship("Project", back_populates="skills")
    skill   = relationship("Skill",   back_populates="project_skills")


# ─────────────────────────────────────────
#  TABLE: proposals
# ─────────────────────────────────────────

class Proposal(Base):
    __tablename__ = "proposals"

    proposal_id        = Column(Integer, primary_key=True, index=True)
    project_id         = Column(Integer, ForeignKey("projects.project_id"),       nullable=False, index=True)
    freelancer_id      = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False, index=True)
    bid_amount         = Column(Float, index=True)
    cover_letter       = Column(Text, nullable=True)
    ai_relevance_score = Column(Float, nullable=True, index=True)
    status             = Column(Enum(ProposalStatus), default=ProposalStatus.pending, index=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project    = relationship("Project",    back_populates="proposals")
    freelancer = relationship("Freelancer", back_populates="proposals")


# ─────────────────────────────────────────
#  TABLE: contracts
# ─────────────────────────────────────────

class Contract(Base):
    __tablename__ = "contracts"

    contract_id   = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"),       nullable=False, index=True)
    freelancer_id = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False, index=True)
    status        = Column(Enum(ContractStatus), default=ContractStatus.active, index=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project         = relationship("Project",    back_populates="contracts")
    freelancer      = relationship("Freelancer", back_populates="contracts")
    milestones      = relationship("Milestone",  back_populates="contract", cascade="all, delete")
    escrow          = relationship("Escrow",     back_populates="contract", uselist=False, cascade="all, delete")
    dispute         = relationship("Dispute",    back_populates="contract", uselist=False, cascade="all, delete")


# ─────────────────────────────────────────
#  TABLE: milestones
# ─────────────────────────────────────────

class Milestone(Base):
    __tablename__ = "milestones"

    milestone_id = Column(Integer, primary_key=True, index=True)
    contract_id  = Column(Integer, ForeignKey("contracts.contract_id"), nullable=False, index=True)
    title        = Column(String(255), nullable=True)
    description  = Column(Text, nullable=True)
    amount       = Column(Float)
    status       = Column(Enum(MilestoneStatus), default=MilestoneStatus.pending, index=True)
    due_date     = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    contract = relationship("Contract", back_populates="milestones")


# ─────────────────────────────────────────
#  TABLE: escrow
# ─────────────────────────────────────────

class Escrow(Base):
    __tablename__ = "escrow"

    escrow_id         = Column(Integer, primary_key=True, index=True)
    contract_id       = Column(Integer, ForeignKey("contracts.contract_id"), unique=True, nullable=False, index=True)
    amount            = Column(Float)
    released_amount   = Column(Float, default=0.0)
    status            = Column(Enum(EscrowStatus), default=EscrowStatus.held, index=True)
    funded_at         = Column(DateTime(timezone=True), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    contract = relationship("Contract", back_populates="escrow")
    payments = relationship("Payment",  back_populates="escrow", cascade="all, delete")


# ─────────────────────────────────────────
#  TABLE: payments
# ─────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    payment_id    = Column(Integer, primary_key=True, index=True)
    escrow_id     = Column(Integer, ForeignKey("escrow.escrow_id"), nullable=False, index=True)
    milestone_id  = Column(Integer, ForeignKey("milestones.milestone_id"), nullable=True, index=True)
    amount        = Column(Float, nullable=True)
    payment_date  = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    escrow = relationship("Escrow", back_populates="payments")


# ─────────────────────────────────────────
#  TABLE: reviews
# ─────────────────────────────────────────

class Review(Base):
    __tablename__ = "reviews"

    review_id     = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"),       nullable=False, index=True)
    freelancer_id = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False, index=True)
    client_id     = Column(Integer, ForeignKey("clients.client_id"),         nullable=False, index=True)
    rating        = Column(Integer, index=True)   # 1–5
    comment       = Column(Text)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project    = relationship("Project",    back_populates="reviews")
    freelancer = relationship("Freelancer", back_populates="reviews")
    client     = relationship("Client")


# ─────────────────────────────────────────
#  TABLE: ai_pricing
# ─────────────────────────────────────────

class AIPricing(Base):
    __tablename__ = "ai_pricing"

    pricing_id    = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"), unique=True, nullable=False, index=True)
    suggested_min = Column(Float)
    suggested_max = Column(Float)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project = relationship("Project", back_populates="ai_pricing")


# ─────────────────────────────────────────
#  TABLE: trust_scores
# ─────────────────────────────────────────

class TrustScore(Base):
    __tablename__ = "trust_scores"

    score_id      = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    score         = Column(Float, default=0.0, index=True)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="trust_scores")


# ─────────────────────────────────────────
#  TABLE: messages
# ─────────────────────────────────────────

class Message(Base):
    __tablename__ = "messages"

    message_id  = Column(Integer, primary_key=True, index=True)
    sender_id   = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content     = Column(Text)
    is_read     = Column(Boolean, default=False, index=True)
    sent_at     = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    sender   = relationship("User", foreign_keys=[sender_id],   back_populates="sent_messages")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="received_messages")


# ─────────────────────────────────────────
#  TABLE: notifications  ✅ Phase 5
# ─────────────────────────────────────────

class Notification(Base):
    """
    Stores in-app notifications for every user.

    The `type` field tells the frontend which icon/colour to show.
    The `entity_id` is an optional FK-equivalent so the frontend can link
    directly to the related object (e.g. contract_id, message_id, etc.).

    Design decisions:
      - Notifications are NEVER deleted automatically — the user can clear them.
      - `is_read` is flipped to True when the user calls GET /notifications
        (auto-mark-read) or PATCH /notifications/{id}/read.
      - WebSocket delivery is best-effort: the notification is always written
        to this table first, then pushed over WS if the user is connected.
    """
    __tablename__ = "notifications"

    notification_id = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type            = Column(Enum(NotificationType), nullable=False, index=True)
    title           = Column(String(255), nullable=False)
    body            = Column(Text, nullable=True)
    entity_id       = Column(Integer, nullable=True)     # e.g. contract_id, message_id
    is_read         = Column(Boolean, default=False, index=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="notifications", foreign_keys=[user_id])


# ─────────────────────────────────────────
#  TABLE: disputes
# ─────────────────────────────────────────

class Dispute(Base):
    __tablename__ = "disputes"

    dispute_id      = Column(Integer, primary_key=True, index=True)
    contract_id     = Column(Integer, ForeignKey("contracts.contract_id"), unique=True, nullable=False, index=True)
    opened_by       = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reason          = Column(Text, nullable=True)
    status          = Column(Enum(DisputeStatus), default=DisputeStatus.open, index=True)
    resolution_note = Column(Text, nullable=True)
    resolved_by     = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    resolved_at     = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    contract = relationship("Contract", back_populates="dispute")


# ─────────────────────────────────────────
#  TABLE: verification
# ─────────────────────────────────────────

class Verification(Base):
    __tablename__ = "verification"

    verification_id = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    document_type   = Column(String(100))
    document_path   = Column(String(500), nullable=True)
    status          = Column(Enum(VerificationStatus), default=VerificationStatus.pending, index=True)
    rejection_note  = Column(Text, nullable=True)
    reviewed_by     = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="verification", foreign_keys=[user_id])


# ─────────────────────────────────────────
#  TABLE: wallet_transactions
# ─────────────────────────────────────────

class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    transaction_id = Column(Integer, primary_key=True, index=True)
    freelancer_id  = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False, index=True)
    amount         = Column(Float)
    type           = Column(Enum(TransactionType), index=True)
    description    = Column(String(255), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    freelancer = relationship("Freelancer", back_populates="wallet_transactions")


# ─────────────────────────────────────────
#  TABLE: files
# ─────────────────────────────────────────

class File(Base):
    __tablename__ = "files"

    file_id       = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"), nullable=False, index=True)
    uploader_id   = Column(Integer, ForeignKey("users.id"),            nullable=False, index=True)
    file_path     = Column(String(500))
    original_name = Column(String(255), nullable=True)
    file_size_kb  = Column(Integer, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project = relationship("Project", back_populates="files")


# ─────────────────────────────────────────
#  TABLE: system_logs
# ─────────────────────────────────────────

class SystemLog(Base):
    __tablename__ = "system_logs"

    log_id       = Column(Integer, primary_key=True, index=True)
    action       = Column(String(255))
    performed_by = Column(Integer, ForeignKey("users.id"), index=True)
    timestamp    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    performed_by_user = relationship("User", back_populates="system_logs")


# ─────────────────────────────────────────
#  TABLE: recommendations  (AI match cache)
# ─────────────────────────────────────────

class Recommendation(Base):
    __tablename__ = "recommendations"

    recommendation_id = Column(Integer, primary_key=True, index=True)
    project_id        = Column(Integer, ForeignKey("projects.project_id",   ondelete="CASCADE"), nullable=False, index=True)
    freelancer_id     = Column(Integer, ForeignKey("freelancers.freelancer_id", ondelete="CASCADE"), nullable=False, index=True)
    match_score       = Column(Float, nullable=False, index=True)
    text_score        = Column(Float, nullable=False, default=0.0)
    skill_score       = Column(Float, nullable=False, default=0.0)
    quality_score     = Column(Float, nullable=False, default=0.0)
    matched_skills    = Column(Text, nullable=True)   # JSON list
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    project    = relationship("Project",    back_populates="recommendations")
    freelancer = relationship("Freelancer", back_populates="recommendations")


    """
ADD THIS TO YOUR EXISTING models.py
====================================
Append these enums and the Subscription class to the bottom of models.py.
Then run your migrations (or let SQLAlchemy auto-create the table on next startup).
"""

# Add these imports to the top of models.py (if not already present):
# from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum, ForeignKey
# import enum

# ─── New Enums ─────────────────────────────────────────────────────────────────

class PlanTier(str, enum.Enum):
    free     = "free"
    pro      = "pro"
    business = "business"

class BillingCycle(str, enum.Enum):
    monthly = "monthly"
    yearly  = "yearly"

class SubscriptionStatus(str, enum.Enum):
    active    = "active"
    cancelled = "cancelled"
    expired   = "expired"
    trialing  = "trialing"

# ─── Subscription Table ────────────────────────────────────────────────────────

class Subscription(Base):
    """
    Tracks each user's active plan.
    One row per user — upserted on upgrade/downgrade.
    """
    __tablename__ = "subscriptions"

    subscription_id = Column(Integer, primary_key=True, index=True)

    # Who owns this subscription
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Plan details
    plan_tier     = Column(Enum(PlanTier),          nullable=False, default=PlanTier.free)
    billing_cycle = Column(Enum(BillingCycle),      nullable=True)   # null for free
    role_type     = Column(String(20),              nullable=False)   # "freelancer" or "client"
    status        = Column(Enum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.active)

    # Timestamps
    started_at    = Column(DateTime(timezone=True), server_default=func.now())
    expires_at    = Column(DateTime(timezone=True), nullable=True)   # null = never (free)
    cancelled_at  = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Payment reference (Stripe subscription ID etc.)
    payment_ref   = Column(String(255), nullable=True)

    # Relationship back to user
    user = relationship("User", back_populates="subscription")


# ─── Add to User model ─────────────────────────────────────────────────────────
# In your existing User class, add this relationship:
#
#   subscription = relationship("Subscription", back_populates="user", uselist=False)
#