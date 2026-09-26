"""telegram_links and tasks.last_nudge_at

Revision ID: 004
Revises: 003
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("last_nudge_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "telegram_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_telegram_links_user_id"), "telegram_links", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_telegram_links_user_id"), table_name="telegram_links")
    op.drop_table("telegram_links")
    op.drop_column("tasks", "last_nudge_at")
