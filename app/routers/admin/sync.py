"""
Sync API Router — snapshot, action ingestion, status, and conflict management.
Cloud-only: gated by RUNTIME_MODE in main.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import DBSession, RequireStaffOrAdmin, RequireAdmin
from app.models.sync_conflict_flag import SyncConflictFlag
from app.schemas.sync import (
    SnapshotResponse,
    SyncActionsBatchRequest,
    SyncActionsBatchResponse,
    SyncConflictFlagResponse,
    SyncStatusResponse,
)
from app.services.sync_service import (
    generate_outlet_snapshot,
    get_sync_status,
    process_sync_actions_batch,
)

router = APIRouter(prefix="/api/admin/sync", tags=["sync"])


@router.get("/outlets/{outlet_id}/snapshot", response_model=SnapshotResponse)
async def snapshot(
    outlet_id: uuid.UUID,
    db: DBSession,
    current_user: RequireStaffOrAdmin,
    since: datetime | None = Query(None, description="ISO timestamp for incremental fetch"),
):
    """Full or incremental snapshot of outlet data for local caching."""
    if current_user.outlet_id and current_user.outlet_id != outlet_id:
        raise HTTPException(status_code=403, detail="Access denied to this outlet")
    return await generate_outlet_snapshot(db, outlet_id, since)


@router.post("/outlets/{outlet_id}/sync/actions", response_model=SyncActionsBatchResponse)
async def sync_actions(
    outlet_id: uuid.UUID,
    body: SyncActionsBatchRequest,
    db: DBSession,
    current_user: RequireStaffOrAdmin,
):
    """Ingest a batch of offline actions with full idempotency."""
    if current_user.outlet_id and current_user.outlet_id != outlet_id:
        raise HTTPException(status_code=403, detail="Access denied to this outlet")
    results = await process_sync_actions_batch(db, outlet_id, body.actions)
    return SyncActionsBatchResponse(results=results)


@router.get("/outlets/{outlet_id}/sync/status", response_model=SyncStatusResponse)
async def sync_status(
    outlet_id: uuid.UUID,
    db: DBSession,
    current_user: RequireStaffOrAdmin,
):
    """Lightweight sync status for connectivity check and admin dashboard."""
    if current_user.outlet_id and current_user.outlet_id != outlet_id:
        raise HTTPException(status_code=403, detail="Access denied to this outlet")
    return await get_sync_status(db, outlet_id)


@router.get("/outlets/{outlet_id}/sync/conflicts", response_model=list[SyncConflictFlagResponse])
async def list_conflicts(
    outlet_id: uuid.UUID,
    db: DBSession,
    current_user: RequireAdmin,
):
    """List unresolved sync conflict flags for manager review."""
    if current_user.outlet_id and current_user.outlet_id != outlet_id:
        raise HTTPException(status_code=403, detail="Access denied to this outlet")
    stmt = select(SyncConflictFlag).where(
        SyncConflictFlag.outlet_id == outlet_id,
        SyncConflictFlag.is_resolved == False,
    ).order_by(SyncConflictFlag.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/outlets/{outlet_id}/sync/conflicts/{conflict_id}/resolve")
async def resolve_conflict(
    outlet_id: uuid.UUID,
    conflict_id: uuid.UUID,
    db: DBSession,
    current_user: RequireAdmin,
):
    """Mark a sync conflict as resolved."""
    if current_user.outlet_id and current_user.outlet_id != outlet_id:
        raise HTTPException(status_code=403, detail="Access denied to this outlet")
    flag = await db.get(SyncConflictFlag, conflict_id)
    if not flag or flag.outlet_id != outlet_id:
        raise HTTPException(status_code=404, detail="Conflict not found")
    flag.is_resolved = True
    flag.resolved_by = current_user.user_id
    return {"status": "resolved", "id": str(conflict_id)}
