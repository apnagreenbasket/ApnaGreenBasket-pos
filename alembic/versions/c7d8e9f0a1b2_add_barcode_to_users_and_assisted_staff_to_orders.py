"""add_barcode_to_users_and_assisted_staff_to_orders

Revision ID: c7d8e9f0a1b2
Revises: be7005abe269
Create Date: 2026-10-16 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = 'be7005abe269'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add barcode to users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('barcode', sa.String(length=100), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_barcode'), ['barcode'], unique=False)

    # 2. Add assisted_by_staff_id and assisted_by_staff_name to orders table
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assisted_by_staff_id', sa.UUID(), nullable=True))
        batch_op.add_column(sa.Column('assisted_by_staff_name', sa.String(length=255), nullable=True))
        batch_op.create_foreign_key(
            batch_op.f('fk_orders_assisted_by_staff_id_users'),
            'users',
            ['assisted_by_staff_id'],
            ['id'],
            ondelete='SET NULL'
        )
        batch_op.create_index(batch_op.f('ix_orders_assisted_by_staff_id'), ['assisted_by_staff_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_orders_assisted_by_staff_id'))
        batch_op.drop_constraint(batch_op.f('fk_orders_assisted_by_staff_id_users'), type_='foreignkey')
        batch_op.drop_column('assisted_by_staff_name')
        batch_op.drop_column('assisted_by_staff_id')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_barcode'))
        batch_op.drop_column('barcode')
