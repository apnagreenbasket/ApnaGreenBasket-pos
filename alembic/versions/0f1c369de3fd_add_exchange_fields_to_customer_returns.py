"""add exchange fields to customer_returns

Revision ID: 0f1c369de3fd
Revises: d4e5f6a7b8c9
Create Date: 2026-09-12 18:44:07.460583

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0f1c369de3fd'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("customer_returns", schema=None) as batch_op:
        batch_op.add_column(sa.Column("exchange_items", sa.JSON(), server_default="[]", nullable=False))
        batch_op.add_column(sa.Column("total_exchange_amount", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False))
        batch_op.add_column(sa.Column("exchange_order_id", sa.UUID(), nullable=True))
        batch_op.create_index(batch_op.f("ix_customer_returns_exchange_order_id"), ["exchange_order_id"], unique=False)
        batch_op.create_foreign_key(batch_op.f("fk_customer_returns_exchange_order_id_orders"), "orders", ["exchange_order_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("customer_returns", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_customer_returns_exchange_order_id_orders"), type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_customer_returns_exchange_order_id"))
        batch_op.drop_column("exchange_order_id")
        batch_op.drop_column("total_exchange_amount")
        batch_op.drop_column("exchange_items")
