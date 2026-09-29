"""add_b2b_enabled_to_outlets

Revision ID: d4e5f6a7b8c9
Revises: ca040fb8b0de
Create Date: 2026-09-12 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'ca040fb8b0de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('b2b_enabled', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.drop_column('b2b_enabled')
