"""
Outlet admin routes — CRUD for the Mart / Grocery Outlet entity.
Superadmin can create outlets; Outlet admins manage their own.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload

from app.dependencies import DBSession, RequireAdmin, RequireStaffOrAdmin, RequireSuperadmin
from app.models.audit_log import AuditLog
from app.models.enums import RoleEnum
from app.models.outlet import Outlet
from app.models.user import User
from app.schemas.outlet import (
    OutletCreate,
    OutletResponse,
    OutletUpdate,
    OutletWithUsersResponse,
)
from app.services.audit_service import log_action
from app.services.cache_service import invalidate_menu_cache

router = APIRouter(prefix="/api/admin/outlets", tags=["admin-outlets"])


async def _build_outlet_response(db: DBSession, outlet: Outlet) -> OutletResponse:
    from app.models.menu_item import MenuItem
    res = await db.execute(
        select(MenuItem.id).where(
            MenuItem.outlet_id == outlet.id,
            MenuItem.is_verification_required == True,  # noqa: E712
        )
    )
    flagged_ids = [str(id_) for id_ in res.scalars().all()]
    data = {c.name: getattr(outlet, c.name) for c in outlet.__table__.columns}
    data["flagged_item_ids"] = flagged_ids
    return OutletResponse(**data)


@router.get("", response_model=list[OutletWithUsersResponse])
async def list_all_outlets(
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """List all onboarded outlets with their associated admin and staff users (superadmin only)."""
    stmt = (
        select(Outlet)
        .options(selectinload(Outlet.users))
        .order_by(Outlet.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "",
    response_model=OutletResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_outlet(
    data: OutletCreate,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """Create a new outlet (superadmin only)."""
    # Check slug uniqueness
    existing = await db.execute(
        select(Outlet).where(Outlet.slug == data.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Outlet with slug '{data.slug}' already exists",
        )

    outlet = Outlet(
        id=uuid.uuid4(),
        **data.model_dump(),
    )
    db.add(outlet)
    await db.flush()
    await db.refresh(outlet)

    await log_action(
        db, outlet.id, current_user.user_id,
        "CREATE", "Outlet", str(outlet.id),
        details=data.model_dump(mode="json"),
    )

    return outlet


@router.get("/me", response_model=OutletResponse)
async def get_my_outlet(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """Get the current user's outlet details."""
    result = await db.execute(
        select(Outlet).where(Outlet.id == current_user.outlet_id)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )
    return await _build_outlet_response(db, outlet)


@router.patch("/me", response_model=OutletResponse)
@router.put("/me", response_model=OutletResponse)
async def update_my_outlet(
    data: OutletUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update the current user's outlet (admin only)."""
    result = await db.execute(
        select(Outlet).where(Outlet.id == current_user.outlet_id)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    # If flagged_item_ids was submitted from outlet settings, update MenuItem.is_verification_required
    if "flagged_item_ids" in update_data:
        raw_flagged = update_data.pop("flagged_item_ids")
        if raw_flagged is not None:
            flagged_uuids = [uuid.UUID(str(fid)) for fid in raw_flagged]
            from app.models.menu_item import MenuItem
            from sqlalchemy import case
            if flagged_uuids:
                await db.execute(
                    update(MenuItem)
                    .where(MenuItem.outlet_id == outlet.id)
                    .values(is_verification_required=case((MenuItem.id.in_(flagged_uuids), True), else_=False))
                )
            else:
                await db.execute(
                    update(MenuItem)
                    .where(MenuItem.outlet_id == outlet.id)
                    .values(is_verification_required=False)
                )

    # Check slug uniqueness if slug is being changed
    if "slug" in update_data and update_data["slug"] != outlet.slug:
        existing = await db.execute(
            select(Outlet).where(Outlet.slug == update_data["slug"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Outlet with slug '{update_data['slug']}' already exists",
            )

    for key, value in update_data.items():
        setattr(outlet, key, value)

    # Sync auto_enabled flag and re-evaluate active state synchronously
    outlet.evening_auto_enabled = (outlet.evening_pricing_mode == "AUTO")
    outlet.evening_price_active = outlet.is_evening_active

    await db.flush()
    await db.refresh(outlet)

    await log_action(
        db, outlet.id, current_user.user_id,
        "UPDATE", "Outlet", str(outlet.id),
        details=data.model_dump(exclude_unset=True, mode="json"),
    )

    await invalidate_menu_cache(outlet.slug)

    return await _build_outlet_response(db, outlet)


@router.patch("/{outlet_id}", response_model=OutletResponse)
@router.put("/{outlet_id}", response_model=OutletResponse)
async def update_outlet_by_id(
    outlet_id: uuid.UUID,
    data: OutletUpdate,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """Update any outlet details by ID (superadmin only)."""
    result = await db.execute(
        select(Outlet).where(Outlet.id == outlet_id)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    # If flagged_item_ids was submitted from outlet settings, update MenuItem.is_verification_required
    if "flagged_item_ids" in update_data:
        raw_flagged = update_data.pop("flagged_item_ids")
        if raw_flagged is not None:
            flagged_uuids = [uuid.UUID(str(fid)) for fid in raw_flagged]
            from app.models.menu_item import MenuItem
            from sqlalchemy import case
            if flagged_uuids:
                await db.execute(
                    update(MenuItem)
                    .where(MenuItem.outlet_id == outlet.id)
                    .values(is_verification_required=case((MenuItem.id.in_(flagged_uuids), True), else_=False))
                )
            else:
                await db.execute(
                    update(MenuItem)
                    .where(MenuItem.outlet_id == outlet.id)
                    .values(is_verification_required=False)
                )

    # Check slug uniqueness if slug is being changed
    if "slug" in update_data and update_data["slug"] != outlet.slug:
        existing = await db.execute(
            select(Outlet).where(Outlet.slug == update_data["slug"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Outlet with slug '{update_data['slug']}' already exists",
            )

    for key, value in update_data.items():
        setattr(outlet, key, value)

    # Sync auto_enabled flag and re-evaluate active state synchronously
    outlet.evening_auto_enabled = (outlet.evening_pricing_mode == "AUTO")
    outlet.evening_price_active = outlet.is_evening_active

    await db.flush()
    await db.refresh(outlet)

    await log_action(
        db, outlet.id, current_user.user_id,
        "UPDATE", "Outlet", str(outlet.id),
        details=data.model_dump(exclude_unset=True, mode="json"),
    )

    await invalidate_menu_cache(outlet.slug)

    return await _build_outlet_response(db, outlet)


@router.delete("/{outlet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outlet(
    outlet_id: uuid.UUID,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """Delete an outlet and all associated users, menus, categories, and orders (superadmin only)."""
    result = await db.execute(
        select(Outlet).where(Outlet.id == outlet_id)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )

    # 1. Protect any SUPERADMIN users by unlinking them from this outlet_id
    await db.execute(
        update(User)
        .where(User.outlet_id == outlet_id, User.role == RoleEnum.SUPERADMIN)
        .values(outlet_id=None)
    )

    # 2. Unlink user_id in audit_logs for any non-superadmin users about to be deleted
    users_to_delete = await db.execute(
        select(User.id).where(User.outlet_id == outlet_id, User.role != RoleEnum.SUPERADMIN)
    )
    user_ids = users_to_delete.scalars().all()
    if user_ids:
        await db.execute(
            update(AuditLog)
            .where(AuditLog.user_id.in_(user_ids))
            .values(user_id=None)
        )

    # 3. Log the audit action using outlet.id BEFORE deleting the outlet
    outlet_name = outlet.name
    outlet_slug = outlet.slug
    await log_action(
        db, outlet.id, current_user.user_id,
        "DELETE", "Outlet", str(outlet_id),
        details={"name": outlet_name, "slug": outlet_slug},
    )
    await db.flush()

    # 4. Delete the outlet entity directly via SQL delete (DB-level ON DELETE CASCADE)
    await db.execute(
        delete(Outlet).where(Outlet.id == outlet_id)
    )
    await db.flush()
