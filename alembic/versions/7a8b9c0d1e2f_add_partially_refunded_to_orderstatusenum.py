"""add partially_refunded to orderstatusenum

Revision ID: 7a8b9c0d1e2f
Revises: 0f1c369de3fd
Create Date: 2026-09-13 02:22:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a8b9c0d1e2f'
down_revision: Union[str, None] = '0f1c369de3fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind and bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(sa.text("ALTER TYPE orderstatusenum ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'"))


def downgrade() -> None:
    pass
