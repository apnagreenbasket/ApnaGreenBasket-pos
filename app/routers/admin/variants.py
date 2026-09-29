"""
MenuItemVariant admin routes — CRUD under a menu item, outlet-scoped.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import DBSession, RequireAdmin, RequireStaffOrAdmin, outlet_scoped_query
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.schemas.menu import VariantCreate, VariantResponse, VariantUpdate
from app.services.audit_service import log_action
from app.services.menu_service import invalidate_outlet_menu

router = APIRouter(
    prefix="/api/admin/menu-items/{item_id}/variants",
    tags=["admin-variants"],
)


async def _get_outlet_menu_item(
    db, item_id: uuid.UUID, outlet_id: uuid.UUID
) -> MenuItem:
    """Verify the menu item exists and belongs to the current outlet."""
    stmt = select(MenuItem).where(MenuItem.id == item_id)
    stmt = outlet_scoped_query(stmt, MenuItem, outlet_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )
    return item


@router.get("", response_model=list[VariantResponse])
async def list_variants(
    item_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """List all variants for a menu item (outlet-scoped)."""
    await _get_outlet_menu_item(db, item_id, current_user.outlet_id)
    result = await db.execute(
        select(MenuItemVariant).where(MenuItemVariant.menu_item_id == item_id)
    )
    return result.scalars().all()


@router.post(
    "",
    response_model=VariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_variant(
    item_id: uuid.UUID,
    data: VariantCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a variant for a menu item."""
    await _get_outlet_menu_item(db, item_id, current_user.outlet_id)

    variant = MenuItemVariant(
        id=uuid.uuid4(),
        menu_item_id=item_id,
        **data.model_dump(),
    )
    db.add(variant)
    await db.flush()
    await db.refresh(variant)

    await invalidate_outlet_menu(db, current_user.outlet_id)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "CREATE", "MenuItemVariant", str(variant.id),
        details=data.model_dump(mode="json"),
    )

    return variant


@router.patch("/{variant_id}", response_model=VariantResponse)
async def update_variant(
    item_id: uuid.UUID,
    variant_id: uuid.UUID,
    data: VariantUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update a variant (outlet-scoped via parent menu item)."""
    await _get_outlet_menu_item(db, item_id, current_user.outlet_id)

    result = await db.execute(
        select(MenuItemVariant).where(
            MenuItemVariant.id == variant_id,
            MenuItemVariant.menu_item_id == item_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variant not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(variant, key, value)

    await db.flush()
    await db.refresh(variant)

    await invalidate_outlet_menu(db, current_user.outlet_id)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "UPDATE", "MenuItemVariant", str(variant.id),
        details=update_data,
    )

    return variant


@router.delete("/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variant(
    item_id: uuid.UUID,
    variant_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a variant (outlet-scoped via parent menu item)."""
    await _get_outlet_menu_item(db, item_id, current_user.outlet_id)

    result = await db.execute(
        select(MenuItemVariant).where(
            MenuItemVariant.id == variant_id,
            MenuItemVariant.menu_item_id == item_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variant not found",
        )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "DELETE", "MenuItemVariant", str(variant.id),
        details={"name": variant.name},
    )

    await db.delete(variant)
    await db.flush()

    await invalidate_outlet_menu(db, current_user.outlet_id)
