"""add_oversold_enum_value

Revision ID: 6c899a271343
Revises: 8ba963a2dd1f
Create Date: 2026-09-10 23:13:45.715556

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6c899a271343'
down_revision: Union[str, None] = '8ba963a2dd1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind and bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(sa.text("ALTER TYPE stockchangetypeenum ADD VALUE IF NOT EXISTS 'OVERSOLD'"))

def downgrade() -> None:
    pass
