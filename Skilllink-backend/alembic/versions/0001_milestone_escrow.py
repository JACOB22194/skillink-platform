"""Milestone escrow state machine — new enums, columns, and tables

Revision ID: 0001
Revises:
Create Date: 2026-06-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# New MilestoneStatus values to add
_NEW_MS_VALUES = [
    "awaiting_funds",
    "funded",
    "in_review",
    "in_revision",
    "in_dispute",
    "closed_success",
    "closed_refunded",
    "closed_auto_approve",
    "closed_auto_refund",
]


def upgrade() -> None:
    # ── Step 1: ENUM alterations must run OUTSIDE the transaction block ──────
    # PostgreSQL requires ALTER TYPE ... ADD VALUE to run in autocommit mode.
    # Using autocommit_block() is the only safe Alembic pattern — manually
    # calling COMMIT inside upgrade() fractures the transaction and can desync
    # the alembic_version table.
    with op.get_context().autocommit_block():
        for value in _NEW_MS_VALUES:
            op.execute(
                f"ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS '{value}'"
            )
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'escrowtransactiontype'
                ) THEN
                    CREATE TYPE escrowtransactiontype AS ENUM ('fund', 'release', 'refund');
                END IF;
            END $$;
            """
        )

    # ── Step 2: Standard DDL inside the normal transaction ───────────────────

    # New columns on milestones
    op.add_column(
        "milestones",
        sa.Column("revision_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "milestones",
        sa.Column("funded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "milestones",
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "milestones",
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
    )

    # escrow_transactions MUST be created before the FK column is added to milestones.
    # Reversing this order causes a FK constraint violation and crashes the migration.
    op.create_table(
        "escrow_transactions",
        sa.Column("escrow_transaction_id", sa.Integer(), nullable=False),
        sa.Column("escrow_id", sa.Integer(), nullable=False),
        sa.Column("milestone_id", sa.Integer(), nullable=True),
        sa.Column(
            "type",
            postgresql.ENUM(
                "fund", "release", "refund",
                name="escrowtransactiontype",
                create_type=False,   # already created above
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["escrow_id"], ["escrow.escrow_id"]),
        sa.ForeignKeyConstraint(["milestone_id"], ["milestones.milestone_id"]),
        sa.PrimaryKeyConstraint("escrow_transaction_id"),
    )
    op.create_index(
        "ix_escrow_transactions_escrow_id", "escrow_transactions", ["escrow_id"]
    )
    op.create_index(
        "ix_escrow_transactions_milestone_id", "escrow_transactions", ["milestone_id"]
    )
    op.create_index(
        "ix_escrow_transactions_type", "escrow_transactions", ["type"]
    )
    op.create_index(
        "ix_escrow_transactions_created_at", "escrow_transactions", ["created_at"]
    )

    # FK column on milestones — after escrow_transactions exists
    op.add_column(
        "milestones",
        sa.Column("escrow_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_milestones_escrow_transaction_id",
        "milestones",
        "escrow_transactions",
        ["escrow_transaction_id"],
        ["escrow_transaction_id"],
    )

    # idempotency_logs — no FK dependencies, order is arbitrary
    op.create_table(
        "idempotency_logs",
        sa.Column("key", sa.String(36), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_index("ix_idempotency_logs_created_at", "idempotency_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_idempotency_logs_created_at", table_name="idempotency_logs")
    op.drop_table("idempotency_logs")

    op.drop_constraint(
        "fk_milestones_escrow_transaction_id", "milestones", type_="foreignkey"
    )
    op.drop_column("milestones", "escrow_transaction_id")

    op.drop_index("ix_escrow_transactions_created_at", table_name="escrow_transactions")
    op.drop_index("ix_escrow_transactions_type", table_name="escrow_transactions")
    op.drop_index("ix_escrow_transactions_milestone_id", table_name="escrow_transactions")
    op.drop_index("ix_escrow_transactions_escrow_id", table_name="escrow_transactions")
    op.drop_table("escrow_transactions")

    op.drop_column("milestones", "deadline")
    op.drop_column("milestones", "submitted_at")
    op.drop_column("milestones", "funded_at")
    op.drop_column("milestones", "revision_count")

    # Note: removing ENUM values from PostgreSQL requires recreating the type
    # and is intentionally omitted from downgrade to avoid data loss.
