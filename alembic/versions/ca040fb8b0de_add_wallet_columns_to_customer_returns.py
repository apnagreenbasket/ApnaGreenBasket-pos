"""add_wallet_columns_to_customer_returns

Revision ID: ca040fb8b0de
Revises: 01f39fa96252
Create Date: 2026-09-12 01:27:04.617232

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca040fb8b0de'
down_revision: Union[str, None] = '01f39fa96252'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("customer_returns", schema=None) as batch_op:
        batch_op.add_column(sa.Column("credit_applied", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False))
        batch_op.add_column(sa.Column("debit_applied", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False))
        batch_op.add_column(sa.Column("debt_settled", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False))
        batch_op.add_column(sa.Column("credit_awarded", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False))
        batch_op.add_column(sa.Column("credit_cashed_out", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False))
        batch_op.add_column(sa.Column("customer_balance", sa.Numeric(precision=10, scale=2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("customer_returns", schema=None) as batch_op:
        batch_op.drop_column("customer_balance")
        batch_op.drop_column("credit_cashed_out")
        batch_op.drop_column("credit_awarded")
        batch_op.drop_column("debt_settled")
        batch_op.drop_column("debit_applied")
        batch_op.drop_column("credit_applied")
