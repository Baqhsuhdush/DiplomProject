"""telegram link meta

Revision ID: 005
Revises: 004
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("telegram_links", sa.Column("telegram_user_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "telegram_links",
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(sa.text("UPDATE telegram_links SET verified = true"))


def downgrade() -> None:
    op.drop_column("telegram_links", "verified")
    op.drop_column("telegram_links", "telegram_user_id")
