"""tests, test_attempts, homework_submissions

Revision ID: 007
Revises: 006
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("test_type", sa.String(length=32), nullable=False),
        sa.Column("questions_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("passing_score", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tests_task_id"), "tests", ["task_id"], unique=False)

    op.create_table(
        "test_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("test_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("answers_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["test_id"], ["tests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_test_attempts_test_id"), "test_attempts", ["test_id"], unique=False)
    op.create_index(op.f("ix_test_attempts_user_id"), "test_attempts", ["user_id"], unique=False)

    op.create_table(
        "homework_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text_answer", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(length=1024), nullable=True),
        sa.Column("original_filename", sa.String(length=512), nullable=True),
        sa.Column("ai_feedback", sa.Text(), nullable=True),
        sa.Column("grade", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_homework_submissions_task_id"), "homework_submissions", ["task_id"], unique=False)
    op.create_index(op.f("ix_homework_submissions_user_id"), "homework_submissions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_homework_submissions_user_id"), table_name="homework_submissions")
    op.drop_index(op.f("ix_homework_submissions_task_id"), table_name="homework_submissions")
    op.drop_table("homework_submissions")
    op.drop_index(op.f("ix_test_attempts_user_id"), table_name="test_attempts")
    op.drop_index(op.f("ix_test_attempts_test_id"), table_name="test_attempts")
    op.drop_table("test_attempts")
    op.drop_index(op.f("ix_tests_task_id"), table_name="tests")
    op.drop_table("tests")
