"""add_reason_and_notes_to_stock_ledger

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-09-15 16:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('stock_ledger', schema=None) as batch_op:
        batch_op.add_column(sa.Column('reason', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('stock_ledger', schema=None) as batch_op:
        batch_op.drop_column('notes')
        batch_op.drop_column('reason')
