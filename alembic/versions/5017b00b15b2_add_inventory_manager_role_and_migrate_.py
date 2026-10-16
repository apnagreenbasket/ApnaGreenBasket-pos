"""add_inventory_manager_role_and_migrate_staff

Revision ID: 5017b00b15b2
Revises: 13323240554c
Create Date: 2026-10-17 04:15:17.192742

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5017b00b15b2'
down_revision: Union[str, None] = '13323240554c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind and bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(sa.text("ALTER TYPE roleenum ADD VALUE IF NOT EXISTS 'INVENTORY_MANAGER'"))

    op.execute(sa.text("UPDATE users SET role = 'INVENTORY_MANAGER' WHERE role = 'STAFF'"))


def downgrade() -> None:
    op.execute(sa.text("UPDATE users SET role = 'STAFF' WHERE role = 'INVENTORY_MANAGER'"))

