"""add_address_city_state_to_customer

Revision ID: 01f39fa96252
Revises: 9d3f1a8e2b7c
Create Date: 2026-09-11 16:40:22.910628

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01f39fa96252'
down_revision: Union[str, None] = '9d3f1a8e2b7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('address', sa.String(500), nullable=True))
        batch_op.add_column(sa.Column('city', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('state', sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.drop_column('state')
        batch_op.drop_column('city')
        batch_op.drop_column('address')

