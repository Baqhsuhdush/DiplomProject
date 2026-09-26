"""learning_resources for tasks

Revision ID: 006
Revises: 005
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "learning_resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("language", sa.String(length=32), nullable=True),
        sa.Column("duration_min", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_learning_resources_task_id"), "learning_resources", ["task_id"], unique=False)
    op.create_index(op.f("ix_learning_resources_source"), "learning_resources", ["source"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_learning_resources_source"), table_name="learning_resources")
    op.drop_index(op.f("ix_learning_resources_task_id"), table_name="learning_resources")
    op.drop_table("learning_resources")
