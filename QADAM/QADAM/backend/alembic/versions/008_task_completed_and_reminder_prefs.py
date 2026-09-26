"""task completed_at, nudge counters, user quiet hours

Revision ID: 008
Revises: 007
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("nudge_count_date_utc", sa.Date(), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("nudges_sent_on_day", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_tasks_completed_at", "tasks", ["completed_at"], unique=False)
    op.add_column(
        "users",
        sa.Column("reminder_quiet_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("users", sa.Column("reminder_quiet_start_hour_local", sa.SmallInteger(), nullable=True))
    op.add_column("users", sa.Column("reminder_quiet_end_hour_local", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "reminder_quiet_end_hour_local")
    op.drop_column("users", "reminder_quiet_start_hour_local")
    op.drop_column("users", "reminder_quiet_enabled")
    op.drop_index("ix_tasks_completed_at", table_name="tasks")
    op.drop_column("tasks", "nudges_sent_on_day")
    op.drop_column("tasks", "nudge_count_date_utc")
    op.drop_column("tasks", "completed_at")
