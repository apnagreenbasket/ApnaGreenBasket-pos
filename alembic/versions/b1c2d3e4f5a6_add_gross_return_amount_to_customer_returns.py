"""add gross_return_amount to customer_returns

Revision ID: b1c2d3e4f5a6
Revises: 7a8b9c0d1e2f
Create Date: 2026-09-13 16:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '7a8b9c0d1e2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("customer_returns", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "gross_return_amount",
                sa.Numeric(precision=10, scale=2),
                server_default="0.00",
                nullable=False,
            )
        )

    # Backfill gross_return_amount for existing records:
    # If gross_return_amount is 0.00, populate it as total_refund_amount + total_exchange_amount
    op.execute(
        sa.text(
            "UPDATE customer_returns "
            "SET gross_return_amount = total_refund_amount + total_exchange_amount "
            "WHERE gross_return_amount = 0 OR gross_return_amount IS NULL"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("customer_returns", schema=None) as batch_op:
        batch_op.drop_column("gross_return_amount")
