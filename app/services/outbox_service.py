"""
Transactional outbox helper for local syncing.
Only runs when RUNTIME_MODE=local. It injects a sync action into the same database transaction.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.datetime_utils import utc_now
from app.models.local_action_queue import LocalActionQueue

settings = get_settings()


def append_to_outbox(
    db: AsyncSession,
    action_type: str,
    payload: dict,
) -> None:
    """
    Appends an action to the local SQLite outbox queue.
    Must be called within an active transaction block.
    If not in local mode, this does nothing.
    """
    if not settings.is_local:
        return

    entry = LocalActionQueue(
        id=uuid.uuid4(),
        client_action_id=f"{action_type}_{uuid.uuid4().hex}",
        action_type=action_type,
        action_timestamp=utc_now(),
        payload=payload,
        synced=False,
    )
    db.add(entry)
