"""
Catalogue admin routes — tenant-scoped CRUD for print catalogue batches.
outlet_id ALWAYS comes from JWT, never from client input.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from app.core.datetime_utils import utc_now

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DBSession, RequireAdmin, outlet_scoped_query
from app.models.catalogue_batch import CatalogueBatch
from app.schemas.catalogue import (
    CatalogueBatchCreate,
    CatalogueBatchResponse,
    CatalogueBatchUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/api/admin/catalogues", tags=["admin-catalogues"])


@router.get("", response_model=list[CatalogueBatchResponse])
async def list_catalogues(
    current_user: RequireAdmin,
    db: DBSession,
):
    """List all catalogue batches for the current user's outlet and clean up old ones."""
    # Lazy cleanup: delete catalogues older than 7 days
    cutoff = utc_now() - timedelta(days=7)
    cleanup_stmt = delete(CatalogueBatch).where(
        CatalogueBatch.outlet_id == current_user.outlet_id,
        CatalogueBatch.created_at < cutoff
    )
    await db.execute(cleanup_stmt)
    await db.commit()

    stmt = select(CatalogueBatch).order_by(CatalogueBatch.updated_at.desc())
    stmt = outlet_scoped_query(stmt, CatalogueBatch, current_user.outlet_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "",
    response_model=CatalogueBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_catalogue(
    data: CatalogueBatchCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a catalogue batch — outlet_id from JWT, not from request body."""
    batch = CatalogueBatch(
        id=uuid.uuid4(),
        outlet_id=current_user.outlet_id,
        **data.model_dump(),
    )
    db.add(batch)
    await db.flush()
    await db.refresh(batch)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "CREATE", "CatalogueBatch", str(batch.id),
        details={"name": data.name, "template": data.template},
    )

    return batch


@router.get("/{batch_id}", response_model=CatalogueBatchResponse)
async def get_catalogue(
    batch_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Get a single catalogue batch (tenant-scoped)."""
    stmt = select(CatalogueBatch).where(CatalogueBatch.id == batch_id)
    stmt = outlet_scoped_query(stmt, CatalogueBatch, current_user.outlet_id)
    result = await db.execute(stmt)
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Catalogue batch not found",
        )
    return batch


@router.put("/{batch_id}", response_model=CatalogueBatchResponse)
async def update_catalogue(
    batch_id: uuid.UUID,
    data: CatalogueBatchUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update a catalogue batch (tenant-scoped)."""
    stmt = select(CatalogueBatch).where(CatalogueBatch.id == batch_id)
    stmt = outlet_scoped_query(stmt, CatalogueBatch, current_user.outlet_id)
    result = await db.execute(stmt)
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Catalogue batch not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(batch, key, value)

    await db.flush()
    await db.refresh(batch)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "UPDATE", "CatalogueBatch", str(batch.id),
        details=update_data,
    )

    return batch


@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalogue(
    batch_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a catalogue batch (tenant-scoped)."""
    stmt = select(CatalogueBatch).where(CatalogueBatch.id == batch_id)
    stmt = outlet_scoped_query(stmt, CatalogueBatch, current_user.outlet_id)
    result = await db.execute(stmt)
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Catalogue batch not found",
        )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "DELETE", "CatalogueBatch", str(batch.id),
        details={"name": batch.name},
    )

    await db.delete(batch)
    await db.flush()
