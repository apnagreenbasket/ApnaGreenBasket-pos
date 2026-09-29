"""
MenuItem admin routes — tenant-scoped product CRUD with variants, categories, barcodes, and image uploads.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.dependencies import DBSession, RequireAdmin, RequireStaffOrAdmin, outlet_scoped_query
from app.models.category import Category
from app.models.enums import PricingModeEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.inventory_item import InventoryItem
from app.schemas.menu import (
    MenuItemCreate,
    MenuItemResponse,
    MenuItemPageResponse,
    MenuItemUpdate,
)
from app.services.audit_service import log_action
from app.services.menu_service import invalidate_outlet_menu

router = APIRouter(prefix="/api/admin/menu-items", tags=["admin-menu-items"])


async def _populate_active_batches(db: DBSession, items: list[MenuItem]) -> None:
    inv_ids = [it.inventory_item_id for it in items if it.inventory_item_id]
    if not inv_ids:
        for it in items:
            it.active_batches = []
            it.current_stock = None
            it.is_out_of_stock = False
        return

    from app.models.stock_intake import StockIntake
    from app.schemas.inventory import ItemBatchSummary

    inv_res = await db.execute(
        select(InventoryItem).where(InventoryItem.id.in_(inv_ids))
    )
    inv_map = {inv.id: inv for inv in inv_res.scalars().all()}

    batches_res = await db.execute(
        select(StockIntake)
        .where(
            StockIntake.item_id.in_(inv_ids),
            StockIntake.remaining_quantity > Decimal("0.000"),
        )
        .order_by(
            StockIntake.expiry_date.asc().nulls_last(),
            StockIntake.intake_date.asc(),
            StockIntake.created_at.asc(),
        )
    )
    all_batches = batches_res.scalars().all()

    batches_by_inv: dict[uuid.UUID, list[StockIntake]] = {}
    for b in all_batches:
        batches_by_inv.setdefault(b.item_id, []).append(b)

    for it in items:
        inv_item = inv_map.get(it.inventory_item_id) if it.inventory_item_id else None
        if inv_item:
            it.current_stock = inv_item.current_stock
            it.allow_oversell = inv_item.allow_oversell if inv_item.allow_oversell is not None else it.allow_oversell
            it.is_out_of_stock = (inv_item.current_stock <= Decimal("0.000"))
        else:
            it.current_stock = None
            it.is_out_of_stock = False

        if it.inventory_item_id and it.inventory_item_id in batches_by_inv:
            inv_batches = batches_by_inv[it.inventory_item_id]
            it.active_batches = [
                ItemBatchSummary(
                    id=b.id,
                    batch_number=b.batch_number or "N/A",
                    remaining_quantity=b.remaining_quantity,
                    unit_cost=b.unit_cost,
                    retail_price=b.retail_price,
                    mrp=b.mrp,
                    wholesale_price=b.wholesale_price,
                    expiry_date=b.expiry_date,
                    intake_date=b.intake_date,
                    is_oldest=(idx == 0),
                )
                for idx, b in enumerate(inv_batches)
            ]
        else:
            it.active_batches = []


@router.get("", response_model=MenuItemPageResponse | list[MenuItemResponse])
@router.get("/", response_model=MenuItemPageResponse | list[MenuItemResponse])
async def list_menu_items(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    category_id: uuid.UUID | None = None,
    available_only: bool = False,
    pricing_mode: PricingModeEnum | None = None,
    search: str | None = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=500),
):
    """List all menu items for the current outlet with variants."""
    stmt = (
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(MenuItem.outlet_id == current_user.outlet_id)
    )

    if category_id:
        stmt = stmt.where(MenuItem.category_id == category_id)
    if available_only:
        stmt = stmt.where(MenuItem.is_available == True)  # noqa: E712
    if pricing_mode:
        stmt = stmt.where(MenuItem.pricing_mode == pricing_mode)
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(MenuItem.name.ilike(s) | MenuItem.barcode.ilike(s))

    stmt = stmt.order_by(MenuItem.total_sold.desc(), MenuItem.name.asc())
    
    total = 0
    if page is not None and page_size is not None:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    res = await db.execute(stmt)
    items = res.scalars().all()
    await _populate_active_batches(db, items)
    
    if page is not None and page_size is not None:
        return MenuItemPageResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size if page_size > 0 else 0
        )
    return items


@router.get("/barcode/{barcode}", response_model=MenuItemResponse)
async def get_menu_item_by_barcode(
    barcode: str,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """Look up a menu item / product by its barcode for POS billing."""
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.outlet_id == current_user.outlet_id,
            MenuItem.barcode == barcode.strip(),
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with barcode '{barcode}' not found",
        )
    await _populate_active_batches(db, [item])
    return item


@router.post("", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    data: MenuItemCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a new menu item / product."""
    # Verify category belongs to tenant
    cat_res = await db.execute(
        select(Category).where(
            Category.id == data.category_id,
            Category.outlet_id == current_user.outlet_id,
        )
    )
    if not cat_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    if data.mrp is not None and float(data.mrp) > 0 and data.price is not None and float(data.mrp) < float(data.price):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"MRP (₹{float(data.mrp):.2f}) cannot be smaller than Selling Price (₹{float(data.price):.2f}).",
        )

    item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=current_user.outlet_id,
        category_id=data.category_id,
        inventory_item_id=data.inventory_item_id,
        name=data.name.strip(),
        barcode=data.barcode.strip() if data.barcode else None,
        description=data.description,
        price=data.price,
        image_url=data.image_url,
        is_available=data.is_available,
        is_on_offer=data.is_on_offer,
        is_verification_required=data.is_verification_required,
        offer_price=data.offer_price,
        offer_label=data.offer_label,
        mrp=data.mrp,
        wholesale_price=data.wholesale_price,
        evening_price=data.evening_price,
        tax_category=data.tax_category,
        tax_rate=data.tax_rate,
        pricing_mode=data.pricing_mode,
        unit_label=data.unit_label,
        alternate_units=data.alternate_units if hasattr(data, "alternate_units") else [],
        allow_oversell=data.allow_oversell if data.allow_oversell is not None else True,
        hsn_code=data.hsn_code.strip() if data.hsn_code else None,
    )
    db.add(item)
    await db.flush()

    # Add initial variants if provided
    if hasattr(data, "variants") and getattr(data, "variants", None):
        for v in data.variants:
            variant = MenuItemVariant(
                id=uuid.uuid4(),
                menu_item_id=item.id,
                name=v.name.strip(),
                price_delta=v.price_delta,
                is_available=v.is_available,
            )
            db.add(variant)
        await db.flush()

    await db.refresh(item)
    # Load variants
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(MenuItem.id == item.id)
    )
    item_loaded = res.scalar_one()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "CREATE_MENU_ITEM",
        "MenuItem",
        str(item.id),
        details={"name": item.name, "price": str(item.price)},
    )
    
    await invalidate_outlet_menu(db, current_user.outlet_id)
    await _populate_active_batches(db, [item_loaded])
    return item_loaded


@router.get("/{item_id}", response_model=MenuItemResponse)
async def get_menu_item(
    item_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """Get single menu item by ID."""
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.id == item_id,
            MenuItem.outlet_id == current_user.outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )
    await _populate_active_batches(db, [item])
    return item


@router.patch("/{item_id}", response_model=MenuItemResponse)
async def update_menu_item(
    item_id: uuid.UUID,
    data: MenuItemUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update a menu item."""
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.id == item_id,
            MenuItem.outlet_id == current_user.outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )

    fields_set = data.model_fields_set

    if "category_id" in fields_set and data.category_id is not None:
        cat_res = await db.execute(
            select(Category).where(
                Category.id == data.category_id,
                Category.outlet_id == current_user.outlet_id,
            )
        )
        if not cat_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found",
            )
        item.category_id = data.category_id

    if "inventory_item_id" in fields_set:
        item.inventory_item_id = data.inventory_item_id
    if "name" in fields_set and data.name is not None:
        item.name = data.name.strip()
    if "barcode" in fields_set:
        item.barcode = data.barcode.strip() if data.barcode else None
    if "description" in fields_set:
        item.description = data.description
    if "price" in fields_set and data.price is not None:
        item.price = data.price
    if "image_url" in fields_set:
        item.image_url = data.image_url
    if "is_available" in fields_set and data.is_available is not None:
        item.is_available = data.is_available
    if "is_on_offer" in fields_set and data.is_on_offer is not None:
        item.is_on_offer = data.is_on_offer
    if "is_verification_required" in fields_set and data.is_verification_required is not None:
        item.is_verification_required = data.is_verification_required
    if "offer_price" in fields_set:
        item.offer_price = data.offer_price
    if "offer_label" in fields_set:
        item.offer_label = data.offer_label
    if "mrp" in fields_set:
        item.mrp = data.mrp
    if "wholesale_price" in fields_set:
        item.wholesale_price = data.wholesale_price
    if "evening_price" in fields_set:
        item.evening_price = data.evening_price
    if "tax_category" in fields_set:
        item.tax_category = data.tax_category
    if "tax_rate" in fields_set:
        item.tax_rate = data.tax_rate
    if "pricing_mode" in fields_set and data.pricing_mode is not None:
        item.pricing_mode = data.pricing_mode
    if "unit_label" in fields_set and data.unit_label is not None:
        item.unit_label = data.unit_label
    if "alternate_units" in fields_set:
        item.alternate_units = data.alternate_units
    if "allow_oversell" in fields_set and data.allow_oversell is not None:
        item.allow_oversell = data.allow_oversell
    if "hsn_code" in fields_set:
        item.hsn_code = data.hsn_code.strip() if data.hsn_code else None

    if item.inventory_item_id:
        inv_res = await db.execute(
            select(InventoryItem).where(InventoryItem.id == item.inventory_item_id)
        )
        inv_obj = inv_res.scalar_one_or_none()
        if inv_obj:
            if "alternate_units" in fields_set:
                inv_obj.alternate_units = data.alternate_units
            if "allow_oversell" in fields_set and data.allow_oversell is not None:
                inv_obj.allow_oversell = data.allow_oversell
            if "hsn_code" in fields_set:
                inv_obj.hsn_code = data.hsn_code.strip() if data.hsn_code else None
            if "price" in fields_set and data.price is not None:
                inv_obj.retail_price = data.price
            if "mrp" in fields_set:
                inv_obj.mrp = data.mrp
            if "wholesale_price" in fields_set:
                inv_obj.wholesale_price = data.wholesale_price

            if any(k in fields_set for k in ("price", "mrp", "wholesale_price")):
                from app.services.inventory_service import sync_oldest_batch_prices_from_item
                await sync_oldest_batch_prices_from_item(
                    db,
                    inv_obj.id,
                    current_user.outlet_id,
                    retail_price=inv_obj.retail_price,
                    mrp=inv_obj.mrp,
                    wholesale_price=inv_obj.wholesale_price,
                )

    effective_mrp = data.mrp if "mrp" in fields_set else item.mrp
    effective_price = item.effective_price
    if effective_mrp is not None and float(effective_mrp) > 0 and effective_price is not None and float(effective_mrp) < float(effective_price):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"MRP (₹{float(effective_mrp):.2f}) cannot be smaller than Selling Price (₹{float(effective_price):.2f}).",
        )

    await db.flush()
    res = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(MenuItem.id == item.id)
    )
    item_loaded = res.scalar_one()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "UPDATE_MENU_ITEM",
        "MenuItem",
        str(item_loaded.id),
        details={"name": item_loaded.name},
    )
    
    await invalidate_outlet_menu(db, current_user.outlet_id)
    await _populate_active_batches(db, [item_loaded])
    return item_loaded


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu_item(
    item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a menu item."""
    res = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.outlet_id == current_user.outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found",
        )

    await db.delete(item)
    await db.flush()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "DELETE_MENU_ITEM",
        "MenuItem",
        str(item_id),
    )
    
    await invalidate_outlet_menu(db, current_user.outlet_id)
