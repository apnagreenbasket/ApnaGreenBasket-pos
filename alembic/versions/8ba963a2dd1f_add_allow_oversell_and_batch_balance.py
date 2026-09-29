"""add_allow_oversell_and_batch_balance

Revision ID: 8ba963a2dd1f
Revises: 04b13e8c498e
Create Date: 2026-09-10 19:35:52.250639

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ba963a2dd1f'
down_revision: Union[str, None] = '04b13e8c498e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass

    with op.batch_alter_table('inventory_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('allow_oversell', sa.Boolean(), server_default='true', nullable=False))

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('allow_oversell', sa.Boolean(), server_default='true', nullable=False))

    with op.batch_alter_table('stock_ledger', schema=None) as batch_op:
        batch_op.add_column(sa.Column('batch_balance', sa.Numeric(precision=12, scale=3), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('stock_ledger', schema=None) as batch_op:
        batch_op.drop_column('batch_balance')

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.drop_column('allow_oversell')

    with op.batch_alter_table('inventory_items', schema=None) as batch_op:
        batch_op.drop_column('allow_oversell')
