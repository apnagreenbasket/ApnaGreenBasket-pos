"""add_floor_incentive_to_outlets_and_status_to_expenses

Revision ID: 13323240554c
Revises: c7d8e9f0a1b2
Create Date: 2026-10-17 03:12:10.083639

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '13323240554c'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    outlet_cols = [c["name"] for c in inspector.get_columns("outlets")]
    expense_cols = [c["name"] for c in inspector.get_columns("expenses")]

    # 1. Add floor incentive rates to outlets table
    with op.batch_alter_table('outlets', schema=None) as batch_op:
        if 'floor_incentive_per_bill' not in outlet_cols:
            batch_op.add_column(sa.Column(
                'floor_incentive_per_bill',
                sa.Numeric(precision=10, scale=2),
                nullable=False,
                server_default='5.00'
            ))
        if 'floor_incentive_percent' not in outlet_cols:
            batch_op.add_column(sa.Column(
                'floor_incentive_percent',
                sa.Numeric(precision=5, scale=2),
                nullable=False,
                server_default='0.50'
            ))

    # 2. Add approval workflow fields to expenses table
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        if 'status' not in expense_cols:
            batch_op.add_column(sa.Column(
                'status',
                sa.String(length=30),
                nullable=False,
                server_default='APPROVED'
            ))
            batch_op.create_index(batch_op.f('ix_expenses_status'), ['status'], unique=False)

        if 'approved_by_id' not in expense_cols:
            batch_op.add_column(sa.Column('approved_by_id', sa.UUID(), nullable=True))
            batch_op.create_foreign_key(
                batch_op.f('fk_expenses_approved_by_id_users'),
                'users',
                ['approved_by_id'],
                ['id'],
                ondelete='SET NULL'
            )

        if 'approved_by_name' not in expense_cols:
            batch_op.add_column(sa.Column('approved_by_name', sa.String(length=255), nullable=True))

        if 'approved_at' not in expense_cols:
            batch_op.add_column(sa.Column('approved_at', sa.DateTime(), nullable=True))

        if 'rejection_reason' not in expense_cols:
            batch_op.add_column(sa.Column('rejection_reason', sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('expenses', schema=None) as batch_op:
        batch_op.drop_column('rejection_reason')
        batch_op.drop_column('approved_at')
        batch_op.drop_column('approved_by_name')
        batch_op.drop_constraint(batch_op.f('fk_expenses_approved_by_id_users'), type_='foreignkey')
        batch_op.drop_column('approved_by_id')
        batch_op.drop_index(batch_op.f('ix_expenses_status'))
        batch_op.drop_column('status')

    with op.batch_alter_table('outlets', schema=None) as batch_op:
        batch_op.drop_column('floor_incentive_percent')
        batch_op.drop_column('floor_incentive_per_bill')
