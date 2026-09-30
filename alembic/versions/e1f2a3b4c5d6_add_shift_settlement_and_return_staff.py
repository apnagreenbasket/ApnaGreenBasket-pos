"""add_shift_settlement_and_return_staff

Revision ID: e1f2a3b4c5d6
Revises: 9309b4eafa59
Create Date: 2026-09-30 08:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = '9309b4eafa59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add shift settlement columns to staff_punch_sessions
    with op.batch_alter_table('staff_punch_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('opening_cash', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('total_bills_count', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('total_sales_amount', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('cash_collected', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('upi_collected', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('card_collected', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('returns_refund_cash', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('expected_cash_in_drawer', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('actual_cash_handed_over', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('cash_difference', sa.Numeric(10, 2), server_default='0.00', nullable=False))
        batch_op.add_column(sa.Column('status', sa.String(20), server_default='OPEN', nullable=False))

    # 2. Add created_by_staff_id to customer_returns
    with op.batch_alter_table('customer_returns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_by_staff_id', sa.UUID(), nullable=True))
        batch_op.create_foreign_key(
            batch_op.f('fk_customer_returns_created_by_staff_id_users'),
            'users',
            ['created_by_staff_id'],
            ['id'],
            ondelete='SET NULL'
        )
        batch_op.create_index(batch_op.f('ix_customer_returns_created_by_staff_id'), ['created_by_staff_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('customer_returns', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_customer_returns_created_by_staff_id'))
        batch_op.drop_constraint(batch_op.f('fk_customer_returns_created_by_staff_id_users'), type_='foreignkey')
        batch_op.drop_column('created_by_staff_id')

    with op.batch_alter_table('staff_punch_sessions', schema=None) as batch_op:
        batch_op.drop_column('status')
        batch_op.drop_column('cash_difference')
        batch_op.drop_column('actual_cash_handed_over')
        batch_op.drop_column('expected_cash_in_drawer')
        batch_op.drop_column('returns_refund_cash')
        batch_op.drop_column('card_collected')
        batch_op.drop_column('upi_collected')
        batch_op.drop_column('cash_collected')
        batch_op.drop_column('total_sales_amount')
        batch_op.drop_column('total_bills_count')
        batch_op.drop_column('opening_cash')
