"""
Inventory admin routes — outlet-scoped ingredient master CRUD, stock intake, recipe mapping, and movement ledger.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, literal_column, case
from sqlalchemy.orm import selectinload

from app.dependencies import DBSession, RequireAdmin, outlet_scoped_query
from app.models.enums import StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.schemas.purchase_return import BatchAdjustmentRequest, PurchaseReturnResponse
from app.schemas.inventory import (
    BatchDetailResponse,
    BatchExpiryAlertResponse,
    BatchPageResponse,
    BatchUpdateMetadataRequest,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryPageResponse,
    RecipeIngredientResponse,
    RecipeSaveRequest,
    ScanIncrementRequest,
    ScanLookupResponse,
    ScanOnboardRequest,
    StockIntakeCreate,
    StockIntakeResponse,
    StockLedgerPageResponse,
    StockLedgerResponse,
    StockWastageRequest,
    StockWastageResponse,
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,
)
from app.services.audit_service import log_action
from app.services.inventory_service import (
    create_inventory_item,
    create_supplier,
    get_all_batches,
    get_near_expiry_alerts,
    list_suppliers,
    log_stock_intake,
    log_stock_wastage,
    onboard_scanned_item,
    quick_scan_increment,
    save_menu_item_recipe,
    update_batch_metadata,
    update_inventory_item,
    update_supplier,
)

router = APIRouter(prefix="/api/admin/inventory", tags=["admin-inventory"])


@router.get("/items", response_model=InventoryPageResponse | list[InventoryItemResponse])
async def list_inventory_items(
    current_user: RequireAdmin,
    db: DBSession,
    low_stock_only: bool = False,
    category: str | None = None,
    search: str | None = None,
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=500),
):
    """List ingredient master items for current outlet."""
    batch_subq = (
        select(
            StockIntake.item_id,
            func.max(func.coalesce(StockIntake.created_at, StockIntake.intake_date)).label("latest_batch_date"),
        )
        .where(StockIntake.outlet_id == current_user.outlet_id)
        .group_by(StockIntake.item_id)
        .subquery()
    )

    effective_latest = case(
        (batch_subq.c.latest_batch_date > InventoryItem.created_at, batch_subq.c.latest_batch_date),
        else_=InventoryItem.created_at,
    )

    stmt = (
        select(
            InventoryItem,
            batch_subq.c.latest_batch_date,
        )
        .outerjoin(batch_subq, InventoryItem.id == batch_subq.c.item_id)
        .where(
            InventoryItem.outlet_id == current_user.outlet_id,
            InventoryItem.is_active == True,  # noqa: E712
        )
    )

    if low_stock_only:
        stmt = stmt.where(
            InventoryItem.current_stock <= InventoryItem.reorder_threshold
        )

    if category and category != "ALL":
        stmt = stmt.where(InventoryItem.category == category)

    if search:
        stmt = stmt.where(InventoryItem.name.ilike(f"%{search.strip()}%"))

    stmt = stmt.order_by(effective_latest.desc(), InventoryItem.name.asc())

    if page is not None and page_size is not None:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    rows = result.all()
    items = []
    for inv_item, latest_b_date in rows:
        inv_item.latest_batch_date = latest_b_date
        items.append(inv_item)

    if page is not None and page_size is not None:
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    return items


@router.post("/items", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    data: InventoryItemCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a new ingredient in outlet inventory master."""
    item = await create_inventory_item(db, current_user.outlet_id, data)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "InventoryItem", str(item.id),
        details={"name": item.name, "unit": item.unit.value if hasattr(item.unit, "value") else str(item.unit)},
    )

    return item


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
async def update_item(
    item_id: uuid.UUID,
    data: InventoryItemUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update ingredient record (threshold, cost per unit, stock)."""
    item = await update_inventory_item(db, current_user.outlet_id, item_id, data)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "InventoryItem", str(item.id),
        details={"name": item.name},
    )

    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_item(
    item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Soft-delete/deactivate an ingredient from inventory master."""
    stmt = select(InventoryItem).where(
        InventoryItem.id == item_id,
        InventoryItem.outlet_id == current_user.outlet_id,
    )
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    # Check if there are any batches with remaining_quantity > 0
    stmt_batch = select(func.count(StockIntake.id)).where(
        StockIntake.item_id == item_id,
        StockIntake.remaining_quantity > 0
    )
    res_batch = await db.execute(stmt_batch)
    active_batches = res_batch.scalar_one()

    if active_batches > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete item. Existing batches have remaining quantity > 0. Remove them first.",
        )

    await db.delete(item)
    await db.flush()

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "InventoryItem", str(item_id),
        details={"name": item.name, "event": "ITEM_DELETED"},
    )


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_batch(
    batch_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Hard-delete a batch and adjust parent item's stock."""
    stmt = select(StockIntake).options(selectinload(StockIntake.item)).where(
        StockIntake.id == batch_id,
        StockIntake.outlet_id == current_user.outlet_id,
    )
    res = await db.execute(stmt)
    batch = res.scalar_one_or_none()
    
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found",
        )

    # Adjust parent item stock
    if batch.item and batch.remaining_quantity > 0:
        batch.item.current_stock -= batch.remaining_quantity
    
    await db.delete(batch)
    await db.flush()

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "StockIntake", str(batch_id),
        details={"event": "BATCH_DELETED", "batch_number": batch.batch_number, "deducted_qty": float(batch.remaining_quantity)},
    )


@router.post("/intake", response_model=StockIntakeResponse, status_code=status.HTTP_201_CREATED)
async def record_stock_intake(
    data: StockIntakeCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Log daily stock intake (updates current stock & appends ledger entry)."""
    intake = await log_stock_intake(
        db, current_user.outlet_id, current_user.user_id, data
    )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "StockIntake", str(intake.id),
        details={"quantity": str(intake.quantity), "unit_cost": str(intake.unit_cost)},
    )

    return intake


@router.get("/ledger", response_model=StockLedgerPageResponse)
async def list_stock_ledger(
    current_user: RequireAdmin,
    db: DBSession,
    item_id: uuid.UUID | None = None,
    change_type: StockChangeTypeEnum | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """Get paginated stock movement audit ledger for current outlet."""
    stmt = (
        select(StockLedger)
        .options(selectinload(StockLedger.item), selectinload(StockLedger.intake))
        .where(StockLedger.outlet_id == current_user.outlet_id)
    )

    if item_id:
        stmt = stmt.where(StockLedger.item_id == item_id)

    if change_type:
        stmt = stmt.where(StockLedger.change_type == change_type)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    # Paginate (latest timestamps first; tie-break identical timestamps by rowid DESC so the latest sub-action is always on top)
    offset = (page - 1) * page_size
    if db.bind and getattr(db.bind.dialect, "name", "") == "sqlite":
        stmt = stmt.order_by(StockLedger.created_at.desc(), literal_column("rowid").desc()).offset(offset).limit(page_size)
    else:
        stmt = stmt.order_by(StockLedger.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(stmt)
    ledger_rows = result.scalars().all()

    items_payload: list[StockLedgerResponse] = []
    for row in ledger_rows:
        batch_num = row.intake.batch_number if row.intake else None
        b_bal = row.batch_balance if row.batch_balance is not None else (row.intake.remaining_quantity if row.intake else None)
        items_payload.append(
            StockLedgerResponse(
                id=row.id,
                outlet_id=row.outlet_id,
                item_id=row.item_id,
                item_name=row.item.name if row.item else "Unknown Item",
                unit=row.item.unit if row.item else None,
                change_type=row.change_type,
                quantity_change=row.quantity_change,
                resulting_stock=row.resulting_stock,
                batch_balance=b_bal,
                batch_number=batch_num,
                reference_order_id=row.reference_order_id,
                intake_id=row.intake_id,
                unit_cost_snapshot=row.unit_cost_snapshot,
                created_by=row.created_by,
                created_at=row.created_at,
                reason=row.reason,
                notes=row.notes,
            )
        )

    total_pages = max(1, math.ceil(total / page_size))
    return StockLedgerPageResponse(
        items=items_payload,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/recipes", response_model=list[RecipeIngredientResponse])
async def save_recipe(
    data: RecipeSaveRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Save ingredient recipe mapping for a dish."""
    new_recipes = await save_menu_item_recipe(db, current_user.outlet_id, data)

    # Re-query with ingredient item names
    res = await db.execute(
        select(MenuItemRecipe)
        .options(selectinload(MenuItemRecipe.inventory_item))
        .where(MenuItemRecipe.menu_item_id == data.menu_item_id)
    )
    rows = res.scalars().all()

    return [
        RecipeIngredientResponse(
            id=r.id,
            menu_item_id=r.menu_item_id,
            inventory_item_id=r.inventory_item_id,
            inventory_item_name=r.inventory_item.name if r.inventory_item else None,
            quantity_required=r.quantity_required,
            unit=r.unit,
        )
        for r in rows
    ]


@router.get("/recipes/{menu_item_id}", response_model=list[RecipeIngredientResponse])
async def get_recipe(
    menu_item_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Fetch ingredient recipe mapping for a dish."""
    res = await db.execute(
        select(MenuItemRecipe)
        .options(selectinload(MenuItemRecipe.inventory_item))
        .where(MenuItemRecipe.menu_item_id == menu_item_id)
    )
    rows = res.scalars().all()

    return [
        RecipeIngredientResponse(
            id=r.id,
            menu_item_id=r.menu_item_id,
            inventory_item_id=r.inventory_item_id,
            inventory_item_name=r.inventory_item.name if r.inventory_item else None,
            quantity_required=r.quantity_required,
            unit=r.unit,
        )
        for r in rows
    ]


@router.get("/alerts", response_model=list[InventoryItemResponse])
async def get_low_stock_alerts(
    current_user: RequireAdmin,
    db: DBSession,
):
    """List ingredients currently at or below reorder threshold."""
    stmt = select(InventoryItem).where(
        InventoryItem.outlet_id == current_user.outlet_id,
        InventoryItem.is_active == True,  # noqa: E712
        InventoryItem.current_stock <= InventoryItem.reorder_threshold,
    ).order_by(InventoryItem.current_stock.asc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/near-expiry-alerts", response_model=list[BatchExpiryAlertResponse])
async def get_near_expiry_alerts_route(
    current_user: RequireAdmin,
    db: DBSession,
    threshold_days: int = Query(7, ge=1, le=90),
):
    """List active stock intake batches approaching or past expiry date."""
    alerts = await get_near_expiry_alerts(
        db, current_user.outlet_id, threshold_days=threshold_days
    )
    return alerts


# ── Hardware Barcode Scanner Endpoints ──────────────────────────────────


@router.get("/barcode/{barcode}", response_model=ScanLookupResponse)
async def lookup_barcode(
    barcode: str,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Look up an item by scanned barcode string.
    Returns item data if found, or found=False if new (prompting onboarding).
    """
    clean_barcode = barcode.strip()
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.outlet_id == current_user.outlet_id,
            InventoryItem.barcode == clean_barcode,
            InventoryItem.is_active == True,  # noqa: E712
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        return ScanLookupResponse(found=False, barcode=clean_barcode, item=None)

    return ScanLookupResponse(
        found=True,
        barcode=clean_barcode,
        item=InventoryItemResponse.model_validate(item),
    )


@router.post("/scan-increment", response_model=InventoryItemResponse)
async def scan_increment_count(
    data: ScanIncrementRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Subsequent scan: Auto-increments item count for recognized barcode.
    Creates a new batch record and logs movement in ledger.
    """
    item, intake = await quick_scan_increment(
        db,
        current_user.outlet_id,
        current_user.user_id,
        barcode=data.barcode,
        quantity=data.quantity,
        batch_number=data.batch_number,
        expiry_date=data.expiry_date,
        unit_cost=data.unit_cost,
    )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "InventoryItem", str(item.id),
        details={"barcode": data.barcode, "quantity": str(data.quantity), "batch_number": intake.batch_number},
    )

    return item


@router.post("/scan-onboard", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
async def scan_onboard_item(
    data: ScanOnboardRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    First-time scan: Onboards a new item with barcode, saves initial batch & stock.
    """
    item, intake = await onboard_scanned_item(
        db,
        current_user.outlet_id,
        current_user.user_id,
        barcode=data.barcode,
        name=data.name,
        category=data.category,
        unit=data.unit,
        initial_stock=data.initial_stock,
        cost_per_unit=data.cost_per_unit,
        selling_price=data.selling_price,
        reorder_threshold=data.reorder_threshold,
        batch_number=data.batch_number,
        expiry_date=data.expiry_date,
        supplier_id=data.supplier_id,
        mrp=data.mrp,
        tax_category=data.tax_category,
        tax_rate=data.tax_rate,
        sorted_quantity=data.sorted_quantity,
        total_billed_amount=data.total_billed_amount,
        item_id=data.item_id,
        wholesale_price=data.wholesale_price,
        shelf_life_alert_hrs=data.shelf_life_alert_hrs,
        alternate_units=data.alternate_units,
        hsn_code=data.hsn_code,
    )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "INVENTORY UPDATED", "InventoryItem", str(item.id),
        details=data.model_dump(mode="json"),
    )

    item.latest_batch_date = (intake.created_at or intake.intake_date) if intake else None
    return item


@router.get("/batches", response_model=BatchPageResponse | list[BatchDetailResponse])
async def list_all_batches_route(
    current_user: RequireAdmin,
    db: DBSession,
    item_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=500),
):
    """List all stock arrival batches for this outlet with FEFO / remaining status, optionally filtered by item_id or search."""
    return await get_all_batches(db, current_user.outlet_id, item_id=item_id, search=search, page=page, page_size=page_size)


@router.get("/suppliers", response_model=list[SupplierResponse])
async def list_suppliers_route(
    current_user: RequireAdmin,
    db: DBSession,
):
    """List all active vendors/suppliers for current outlet."""
    return await list_suppliers(db, current_user.outlet_id)


@router.post("/suppliers", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier_route(
    data: SupplierCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a new vendor/supplier record for current outlet."""
    supplier = await create_supplier(db, current_user.outlet_id, data)

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "CREATE", "Supplier", str(supplier.id),
        details={"name": supplier.name, "phone": supplier.phone},
    )

    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def update_supplier_route(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update an existing vendor/supplier record."""
    supplier = await update_supplier(db, current_user.outlet_id, supplier_id, data)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )

    await log_action(
        db, current_user.outlet_id, current_user.user_id,
        "UPDATE", "Supplier", str(supplier.id),
        details={"name": supplier.name},
    )

    return supplier


@router.post("/wastage", response_model=StockWastageResponse)
async def log_inventory_wastage(
    data: StockWastageRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Log stock loss, spoilage, transit damage, or physical audit discrepancy.
    Deducts current stock, adjusts batch if applicable, and writes to StockLedger with MANUAL_ADJUSTMENT.
    """
    res = await log_stock_wastage(
        db,
        current_user.outlet_id,
        data,
        user_id=current_user.user_id,
    )

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "INVENTORY UPDATED",
        "InventoryItem",
        str(data.item_id),
        details=data.model_dump(mode="json"),
    )

    return res


@router.patch("/batches/{intake_id}")
async def update_batch_metadata_endpoint(
    intake_id: uuid.UUID,
    data: BatchUpdateMetadataRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Update batch metadata & pricing: batch number, expiry date, arrival timestamp, supplier, notes, prices, alternate units.
    Preserves stock levels, ledger integrity, and strictly anchors shelf-life math to intake_date.
    """
    res = await update_batch_metadata(
        db,
        current_user.outlet_id,
        intake_id,
        data,
    )

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "UPDATE_BATCH_METADATA",
        "StockIntake",
        str(intake_id),
        details=data.model_dump(mode="json", exclude_unset=True),
    )

    return res


@router.post("/batches/{intake_id}/adjust")
async def adjust_batch_stock_endpoint(
    intake_id: uuid.UUID,
    data: BatchAdjustmentRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Adjust batch stock: return to supplier, audit adjustment, or void batch.
    Returns return_number if purchase return bill was generated.
    """
    from app.services.inventory_service import adjust_batch_stock

    res = await adjust_batch_stock(
        db,
        current_user.outlet_id,
        intake_id,
        current_user,
        data,
    )

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "ADJUST_BATCH",
        "StockIntake",
        str(intake_id),
        details=data.model_dump(mode="json"),
    )

    return res


@router.get("/purchase-returns")
async def list_purchase_returns_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
):
    """List all purchase return bills for current outlet."""
    from app.services.inventory_service import list_purchase_returns
    return await list_purchase_returns(db, current_user.outlet_id)


@router.get("/purchase-returns/{return_id}")
async def get_purchase_return_endpoint(
    return_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Get purchase return bill details by ID."""
    from app.services.inventory_service import get_purchase_return_by_id
    return await get_purchase_return_by_id(db, current_user.outlet_id, return_id)
