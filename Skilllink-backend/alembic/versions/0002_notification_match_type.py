"""Add 'match' value to notificationtype enum

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-22
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE must run outside a transaction block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'match'")


def downgrade() -> None:
    # Removing an ENUM value requires recreating the type; intentionally
    # omitted to avoid data loss, consistent with 0001's downgrade.
    pass
