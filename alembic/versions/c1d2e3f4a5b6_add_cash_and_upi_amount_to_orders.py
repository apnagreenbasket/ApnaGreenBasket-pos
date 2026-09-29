"""add cash_amount and upi_amount to orders

Revision ID: c1d2e3f4a5b6
Revises: b1c2d3e4f5a6
Create Date: 2026-09-14 02:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "cash_amount",
                sa.Numeric(precision=10, scale=2),
                server_default="0.00",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "upi_amount",
                sa.Numeric(precision=10, scale=2),
                server_default="0.00",
                nullable=False,
            )
        )

    # Backfill legacy records based on payment_method:
    op.execute(
        sa.text(
            "UPDATE orders "
            "SET cash_amount = CASE "
            "  WHEN (total_amount - COALESCE(credit_applied, 0) - COALESCE(debit_applied, 0)) > 0 "
            "  THEN (total_amount - COALESCE(credit_applied, 0) - COALESCE(debit_applied, 0)) "
            "  ELSE 0 END "
            "WHERE UPPER(COALESCE(payment_method, '')) = 'CASH' "
            "  AND (cash_amount IS NULL OR cash_amount = 0)"
        )
    )
    op.execute(
        sa.text(
            "UPDATE orders "
            "SET upi_amount = CASE "
            "  WHEN (total_amount - COALESCE(credit_applied, 0) - COALESCE(debit_applied, 0)) > 0 "
            "  THEN (total_amount - COALESCE(credit_applied, 0) - COALESCE(debit_applied, 0)) "
            "  ELSE 0 END "
            "WHERE UPPER(COALESCE(payment_method, '')) = 'UPI' "
            "  AND (upi_amount IS NULL OR upi_amount = 0)"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.drop_column("upi_amount")
        batch_op.drop_column("cash_amount")
