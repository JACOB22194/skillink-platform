"""
models.py — Database Tables
============================
Each class here = one table in PostgreSQL.
SQLAlchemy reads these classes and creates the actual tables.

Changes from the original your team wrote:
  - Added  mfa_enabled  and  mfa_secret  to User table (needed for MFA login)
  - Added  portfolio_file  to Freelancer table (needed for portfolio upload)
  - Everything else is exactly as your teammate wrote it
"""

from sqlalchemy import (
    Column, Integer, String, Text,
    Float, DateTime, Enum, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from db import Base
import enum


# ─────────────────────────────────────────────
#  ENUMS — allowed values for specific columns
# ─────────────────────────────────────────────

class UserRole(str, enum.Enum):
    freelancer = "freelancer"
    client     = "client"
    admin      = "admin"

class UserStatus(str, enum.Enum):
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


# ─────────────────────────────────────────────
#  TABLE: users
# ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id          = Column(Integer, primary_key=True, index=True)
    email       = Column(String(255), unique=True, nullable=False, index=True)
    password    = Column(String(255), nullable=False)
    role        = Column(Enum(UserRole), nullable=False)
    status      = Column(Enum(UserStatus), default=UserStatus.active)
    mfa_enabled = Column(Boolean, default=False)      # NEW: is MFA turned on?
    mfa_secret  = Column(String(64), nullable=True)   # NEW: the TOTP secret key
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships (links to other tables)
    freelancer        = relationship("Freelancer",   back_populates="user", uselist=False)
    client            = relationship("Client",       back_populates="user", uselist=False)
    trust_scores      = relationship("TrustScore",   back_populates="user")
    verification      = relationship("Verification", back_populates="user", uselist=False)
    system_logs       = relationship("SystemLog",    back_populates="performed_by_user")
    sent_messages     = relationship("Message", foreign_keys="Message.sender_id",
                                     back_populates="sender")
    received_messages = relationship("Message", foreign_keys="Message.receiver_id",
                                     back_populates="receiver")


# ─────────────────────────────────────────────
#  TABLE: freelancers
# ─────────────────────────────────────────────

class Freelancer(Base):
    __tablename__ = "freelancers"

    freelancer_id  = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    bio            = Column(Text)
    hourly_rate    = Column(Float)
    success_score  = Column(Float, default=0.0)
    wallet_balance = Column(Float, default=0.0)
    portfolio_file = Column(String(500), nullable=True)   # NEW: uploaded portfolio path

    user                = relationship("User",            back_populates="freelancer")
    proposals           = relationship("Proposal",        back_populates="freelancer")
    contracts           = relationship("Contract",        back_populates="freelancer")
    reviews             = relationship("Review",          back_populates="freelancer")
    skills              = relationship("FreelancerSkill", back_populates="freelancer")
    wallet_transactions = relationship("WalletTransaction", back_populates="freelancer")


# ─────────────────────────────────────────────
#  TABLE: clients
# ─────────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"

    client_id    = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    company_name = Column(String(255))

    user     = relationship("User",    back_populates="client")
    projects = relationship("Project", back_populates="client")


# ─────────────────────────────────────────────
#  TABLE: skills
# ─────────────────────────────────────────────

class Skill(Base):
    __tablename__ = "skills"

    skill_id = Column(Integer, primary_key=True, index=True)
    name     = Column(String(100), unique=True, nullable=False)

    freelancer_skills = relationship("FreelancerSkill", back_populates="skill")
    project_skills    = relationship("ProjectSkill",    back_populates="skill")


# ─────────────────────────────────────────────
#  TABLE: freelancer_skills (junction table)
# ─────────────────────────────────────────────

class FreelancerSkill(Base):
    __tablename__ = "freelancer_skills"

    freelancer_id = Column(Integer, ForeignKey("freelancers.freelancer_id"), primary_key=True)
    skill_id      = Column(Integer, ForeignKey("skills.skill_id"),           primary_key=True)

    freelancer = relationship("Freelancer", back_populates="skills")
    skill      = relationship("Skill",      back_populates="freelancer_skills")


# ─────────────────────────────────────────────
#  TABLE: projects
# ─────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    project_id  = Column(Integer, primary_key=True, index=True)
    client_id   = Column(Integer, ForeignKey("clients.client_id"), nullable=False)
    title       = Column(String(255), nullable=False)
    description = Column(Text)
    budget      = Column(Float)
    status      = Column(Enum(ProjectStatus), default=ProjectStatus.open)

    client     = relationship("Client",       back_populates="projects")
    proposals  = relationship("Proposal",     back_populates="project")
    contracts  = relationship("Contract",     back_populates="project")
    reviews    = relationship("Review",       back_populates="project")
    files      = relationship("File",         back_populates="project")
    skills     = relationship("ProjectSkill", back_populates="project")
    ai_pricing = relationship("AIPricing",    back_populates="project", uselist=False)


# ─────────────────────────────────────────────
#  TABLE: project_skills (junction table)
# ─────────────────────────────────────────────

class ProjectSkill(Base):
    __tablename__ = "project_skills"

    project_id = Column(Integer, ForeignKey("projects.project_id"), primary_key=True)
    skill_id   = Column(Integer, ForeignKey("skills.skill_id"),     primary_key=True)

    project = relationship("Project", back_populates="skills")
    skill   = relationship("Skill",   back_populates="project_skills")


# ─────────────────────────────────────────────
#  TABLE: proposals
# ─────────────────────────────────────────────

class Proposal(Base):
    __tablename__ = "proposals"

    proposal_id        = Column(Integer, primary_key=True, index=True)
    project_id         = Column(Integer, ForeignKey("projects.project_id"),       nullable=False)
    freelancer_id      = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False)
    bid_amount         = Column(Float)
    ai_relevance_score = Column(Float)
    status             = Column(Enum(ProposalStatus), default=ProposalStatus.pending)

    project    = relationship("Project",    back_populates="proposals")
    freelancer = relationship("Freelancer", back_populates="proposals")


# ─────────────────────────────────────────────
#  TABLE: contracts
# ─────────────────────────────────────────────

class Contract(Base):
    __tablename__ = "contracts"

    contract_id   = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"),       nullable=False)
    freelancer_id = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False)
    status        = Column(Enum(ContractStatus), default=ContractStatus.active)

    project    = relationship("Project",    back_populates="contracts")
    freelancer = relationship("Freelancer", back_populates="contracts")
    milestones = relationship("Milestone",  back_populates="contract")
    escrow     = relationship("Escrow",     back_populates="contract", uselist=False)
    dispute    = relationship("Dispute",    back_populates="contract", uselist=False)


# ─────────────────────────────────────────────
#  TABLE: milestones
# ─────────────────────────────────────────────

class Milestone(Base):
    __tablename__ = "milestones"

    milestone_id = Column(Integer, primary_key=True, index=True)
    contract_id  = Column(Integer, ForeignKey("contracts.contract_id"), nullable=False)
    amount       = Column(Float)
    status       = Column(Enum(MilestoneStatus), default=MilestoneStatus.pending)

    contract = relationship("Contract", back_populates="milestones")


# ─────────────────────────────────────────────
#  TABLE: escrow
# ─────────────────────────────────────────────

class Escrow(Base):
    __tablename__ = "escrow"

    escrow_id   = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.contract_id"), unique=True, nullable=False)
    amount      = Column(Float)
    status      = Column(Enum(EscrowStatus), default=EscrowStatus.held)

    contract = relationship("Contract", back_populates="escrow")
    payments = relationship("Payment",  back_populates="escrow")


# ─────────────────────────────────────────────
#  TABLE: payments
# ─────────────────────────────────────────────

class Payment(Base):
    __tablename__ = "payments"

    payment_id   = Column(Integer, primary_key=True, index=True)
    escrow_id    = Column(Integer, ForeignKey("escrow.escrow_id"), nullable=False)
    payment_date = Column(DateTime(timezone=True), server_default=func.now())

    escrow = relationship("Escrow", back_populates="payments")


# ─────────────────────────────────────────────
#  TABLE: reviews
# ─────────────────────────────────────────────

class Review(Base):
    __tablename__ = "reviews"

    review_id     = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"),       nullable=False)
    freelancer_id = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False)
    rating        = Column(Integer)
    comment       = Column(Text)

    project    = relationship("Project",    back_populates="reviews")
    freelancer = relationship("Freelancer", back_populates="reviews")


# ─────────────────────────────────────────────
#  TABLE: ai_pricing
# ─────────────────────────────────────────────

class AIPricing(Base):
    __tablename__ = "ai_pricing"

    pricing_id    = Column(Integer, primary_key=True, index=True)
    project_id    = Column(Integer, ForeignKey("projects.project_id"), unique=True, nullable=False)
    suggested_min = Column(Float)
    suggested_max = Column(Float)

    project = relationship("Project", back_populates="ai_pricing")


# ─────────────────────────────────────────────
#  TABLE: trust_scores
# ─────────────────────────────────────────────

class TrustScore(Base):
    __tablename__ = "trust_scores"

    score_id      = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    score         = Column(Float, default=0.0)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="trust_scores")


# ─────────────────────────────────────────────
#  TABLE: messages
# ─────────────────────────────────────────────

class Message(Base):
    __tablename__ = "messages"

    message_id  = Column(Integer, primary_key=True, index=True)
    sender_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content     = Column(Text)
    sent_at     = Column(DateTime(timezone=True), server_default=func.now())

    sender   = relationship("User", foreign_keys=[sender_id],   back_populates="sent_messages")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="received_messages")


# ─────────────────────────────────────────────
#  TABLE: disputes
# ─────────────────────────────────────────────

class Dispute(Base):
    __tablename__ = "disputes"

    dispute_id  = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.contract_id"), unique=True, nullable=False)
    status      = Column(Enum(DisputeStatus), default=DisputeStatus.open)

    contract = relationship("Contract", back_populates="dispute")


# ─────────────────────────────────────────────
#  TABLE: verification
# ─────────────────────────────────────────────

class Verification(Base):
    __tablename__ = "verification"

    verification_id = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    document_type   = Column(String(100))
    status          = Column(Enum(VerificationStatus), default=VerificationStatus.pending)

    user = relationship("User", back_populates="verification")


# ─────────────────────────────────────────────
#  TABLE: wallet_transactions
# ─────────────────────────────────────────────

class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    transaction_id = Column(Integer, primary_key=True, index=True)
    freelancer_id  = Column(Integer, ForeignKey("freelancers.freelancer_id"), nullable=False)
    amount         = Column(Float)
    type           = Column(Enum(TransactionType))

    freelancer = relationship("Freelancer", back_populates="wallet_transactions")


# ─────────────────────────────────────────────
#  TABLE: files
# ─────────────────────────────────────────────

class File(Base):
    __tablename__ = "files"

    file_id     = Column(Integer, primary_key=True, index=True)
    project_id  = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    uploader_id = Column(Integer, ForeignKey("users.id"),            nullable=False)
    file_path   = Column(String(500))

    project = relationship("Project", back_populates="files")


# ─────────────────────────────────────────────
#  TABLE: system_logs
# ─────────────────────────────────────────────

class SystemLog(Base):
    __tablename__ = "system_logs"

    log_id       = Column(Integer, primary_key=True, index=True)
    action       = Column(String(255))
    performed_by = Column(Integer, ForeignKey("users.id"))
    timestamp    = Column(DateTime(timezone=True), server_default=func.now())

    performed_by_user = relationship("User", back_populates="system_logs")