"""add_hsn_code_and_gst_compliance_fields

Revision ID: 9d3f1a8e2b7c
Revises: 6c899a271343
Create Date: 2026-09-11 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d3f1a8e2b7c'
down_revision: Union[str, None] = '6c899a271343'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('inventory_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hsn_code', sa.String(20), nullable=True))
        batch_op.create_index(batch_op.f('ix_inventory_items_hsn_code'), ['hsn_code'], unique=False)

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hsn_code', sa.String(20), nullable=True))
        batch_op.create_index(batch_op.f('ix_menu_items_hsn_code'), ['hsn_code'], unique=False)

    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hsn_code', sa.String(20), nullable=True))

    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_interstate', sa.Boolean(), server_default='false', nullable=False))
        batch_op.add_column(sa.Column('place_of_supply', sa.String(100), nullable=True))

    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gstin', sa.String(50), nullable=True))
        batch_op.create_index(batch_op.f('ix_customers_gstin'), ['gstin'], unique=False)
        batch_op.add_column(sa.Column('legal_name', sa.String(255), nullable=True))
        batch_op.add_column(sa.Column('state_code', sa.String(10), nullable=True))

    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('interstate_mode', sa.String(20), server_default='PER_BILL', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.drop_column('interstate_mode')

    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.drop_column('state_code')
        batch_op.drop_column('legal_name')
        batch_op.drop_index(batch_op.f('ix_customers_gstin'))
        batch_op.drop_column('gstin')

    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_column('place_of_supply')
        batch_op.drop_column('is_interstate')

    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.drop_column('hsn_code')

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_menu_items_hsn_code'))
        batch_op.drop_column('hsn_code')

    with op.batch_alter_table('inventory_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_inventory_items_hsn_code'))
        batch_op.drop_column('hsn_code')
