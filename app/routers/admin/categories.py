"""
Category admin routes — tenant-scoped CRUD.
outlet_id ALWAYS comes from JWT, never from client input.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DBSession, RequireAdmin, RequireStaffOrAdmin, outlet_scoped_query
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from app.services.audit_service import log_action
from app.services.menu_service import invalidate_outlet_menu

router = APIRouter(prefix="/api/admin/categories", tags=["admin-categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """List all categories for the current user's outlet."""
    stmt = select(Category).order_by(Category.display_order)
    stmt = outlet_scoped_query(stmt, Category, current_user.outlet_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    data: CategoryCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a category — outlet_id from JWT, not from request body."""
    category = Category(
        id=uuid.uuid4(),
        outlet_id=current_user.outlet_id,  # FROM JWT
        **data.model_dump(),
    )
    db.add(category)
    await db.flush()
    await db.refresh(category)

    # Invalidate menu cache for this outlet
    await invalidate_outlet_menu(db, current_user.outlet_id)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "CREATE", "Category", str(category.id),
        details=data.model_dump(),
    )

    return category


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Get a single category (tenant-scoped)."""
    stmt = select(Category).where(Category.id == category_id)
    stmt = outlet_scoped_query(stmt, Category, current_user.outlet_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    return category


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    data: CategoryUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update a category (tenant-scoped)."""
    stmt = select(Category).where(Category.id == category_id)
    stmt = outlet_scoped_query(stmt, Category, current_user.outlet_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(category, key, value)

    await db.flush()
    await db.refresh(category)

    # Invalidate menu cache
    await invalidate_outlet_menu(db, current_user.outlet_id)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "UPDATE", "Category", str(category.id),
        details=update_data,
    )

    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a category (tenant-scoped, cascades to menu items)."""
    stmt = select(Category).where(Category.id == category_id)
    stmt = outlet_scoped_query(stmt, Category, current_user.outlet_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "DELETE", "Category", str(category.id),
        details={"name": category.name},
    )

    await db.delete(category)
    await db.flush()

    # Invalidate menu cache
    await invalidate_outlet_menu(db, current_user.outlet_id)
