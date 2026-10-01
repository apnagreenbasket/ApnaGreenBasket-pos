"""add_latest_batch_price_override_to_outlets

Revision ID: f5a6b7c8d9e0
Revises: e1f2a3b4c5d6
Create Date: 2026-10-01 12:57:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('latest_batch_price_override', sa.Boolean(), server_default='true', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.drop_column('latest_batch_price_override')
