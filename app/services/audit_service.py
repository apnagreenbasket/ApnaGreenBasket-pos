"""
Audit service — log who changed what for dispute resolution.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    outlet_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    action: str = "",
    entity_type: str = "",
    entity_id: str = "",
    details: dict[str, Any] | None = None,
    description: str | None = None,
) -> None:
    """
    Write an audit log entry.
    Called from routers/services after state-changing operations.
    """
    clean_details = None
    if details is not None:
        import json
        clean_details = json.loads(json.dumps(details, default=str))

    entry = AuditLog(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=clean_details,
        description=description,
    )
    db.add(entry)
    # Don't flush here — let the caller's transaction handle it
