"""progress_logs audit table

Revision ID: 009
Revises: 008
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "progress_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_progress_logs_user_id", "progress_logs", ["user_id"], unique=False)
    op.create_index("ix_progress_logs_event_type", "progress_logs", ["event_type"], unique=False)
    op.create_index("ix_progress_logs_goal_id", "progress_logs", ["goal_id"], unique=False)
    op.create_index("ix_progress_logs_task_id", "progress_logs", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_progress_logs_task_id", table_name="progress_logs")
    op.drop_index("ix_progress_logs_goal_id", table_name="progress_logs")
    op.drop_index("ix_progress_logs_event_type", table_name="progress_logs")
    op.drop_index("ix_progress_logs_user_id", table_name="progress_logs")
    op.drop_table("progress_logs")
