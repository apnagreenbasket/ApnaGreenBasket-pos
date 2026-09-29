"""
Sync service — snapshot generation, offline action ingestion with idempotency,
and conflict detection for the desktop POS sync API.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now, ensure_naive_utc

from app.models.category import Category
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.outlet import Outlet
from app.models.user import User
from app.models.enums import RoleEnum
from app.models.stock_intake import StockIntake
from app.models.sync_action_log import SyncActionLog
from app.models.sync_conflict_flag import SyncConflictFlag
from app.schemas.sync import (
    CategorySnapshot,
    CustomerSnapshot,
    InventoryItemSnapshot,
    MenuItemSnapshot,
    MenuItemVariantSnapshot,
    MenuItemRecipeSnapshot,
    OutletConfigSnapshot,
    SnapshotResponse,
    StaffSnapshot,
    StockIntakeSnapshot,
    SupplierSnapshot,
    SyncAction,
    SyncActionResult,
    SyncStatusResponse,
)


async def generate_outlet_snapshot(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    since: datetime | None = None,
) -> SnapshotResponse:
    """
    Generate a full or incremental snapshot of an outlet's data for local caching.
    If `since` is None or older than 24 hours, returns a full snapshot.
    Otherwise returns only rows updated/created after `since`.
    """
    outlet = await db.get(Outlet, outlet_id)
    if not outlet:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Outlet not found")

    since_naive = ensure_naive_utc(since)
    is_full = since_naive is None or since_naive < utc_now() - timedelta(hours=24)

    # Categories
    cat_stmt = select(Category).where(Category.outlet_id == outlet_id)
    if not is_full and since_naive is not None:
        cat_stmt = cat_stmt.where(Category.updated_at > since_naive)
    cats = (await db.execute(cat_stmt)).scalars().all()

    # Menu Items (with category name and current_stock from linked inventory item)
    mi_stmt = select(MenuItem, Category.name.label("cat_name"), InventoryItem.current_stock).join(
        Category, MenuItem.category_id == Category.id
    ).outerjoin(
        InventoryItem, MenuItem.inventory_item_id == InventoryItem.id
    ).where(MenuItem.outlet_id == outlet_id)
    if not is_full and since_naive is not None:
        mi_stmt = mi_stmt.where(MenuItem.updated_at > since_naive)
    mi_rows = (await db.execute(mi_stmt)).all()

    menu_items = []
    for mi, cat_name, cur_stock in mi_rows:
        menu_items.append(MenuItemSnapshot(
            id=mi.id, name=mi.name, barcode=mi.barcode, category_id=mi.category_id,
            category_name=cat_name, inventory_item_id=mi.inventory_item_id,
            price=mi.price, mrp=mi.mrp, wholesale_price=mi.wholesale_price,
            evening_price=mi.evening_price, offer_price=mi.offer_price,
            is_on_offer=mi.is_on_offer, is_available=mi.is_available,
            pricing_mode=mi.pricing_mode.value if hasattr(mi.pricing_mode, 'value') else mi.pricing_mode,
            unit_label=mi.unit_label, tax_category=mi.tax_category, tax_rate=mi.tax_rate,
            image_url=mi.image_url, current_stock=cur_stock, updated_at=mi.updated_at,
        ))

    from app.models.enums import RoleEnum
    from app.models.user import User

    # Staff (include pin_hash, NEVER include password_hash or refresh_token_hash)
    staff_stmt = select(User).where(User.outlet_id == outlet_id, User.status == "active", User.role != RoleEnum.SUPERADMIN)
    if not is_full and since_naive is not None:
        staff_stmt = staff_stmt.where(User.updated_at > since_naive)
    staff_rows = (await db.execute(staff_stmt)).scalars().all()
    staff_list = [StaffSnapshot(
        id=s.id, name=s.name or (s.email.split("@")[0].title() if s.email else "Team Member"),
        role=s.role.value if hasattr(s.role, 'value') else s.role,
        pin_hash=s.pin_hash, status=s.status, updated_at=s.updated_at,
    ) for s in staff_rows]

    # Inventory Items
    inv_stmt = select(InventoryItem).where(InventoryItem.outlet_id == outlet_id)
    if not is_full and since_naive is not None:
        inv_stmt = inv_stmt.where(InventoryItem.updated_at > since_naive)
    inv_rows = (await db.execute(inv_stmt)).scalars().all()
    inv_list = [InventoryItemSnapshot(
        id=i.id, name=i.name, barcode=i.barcode,
        unit=i.unit.value if hasattr(i.unit, 'value') else i.unit,
        category=i.category, current_stock=i.current_stock, cost_per_unit=i.cost_per_unit,
        mrp=i.mrp, tax_category=i.tax_category, tax_rate=i.tax_rate, updated_at=i.updated_at,
    ) for i in inv_rows]

    # Stock Intakes (use updated_at/created_at for incremental)
    si_stmt = select(StockIntake).options(selectinload(StockIntake.supplier)).where(StockIntake.outlet_id == outlet_id)
    if not is_full and since_naive is not None:
        si_stmt = si_stmt.where(StockIntake.created_at > since_naive)
    si_rows = (await db.execute(si_stmt)).scalars().all()
    si_list = [StockIntakeSnapshot(
        id=s.id, item_id=s.item_id, batch_number=s.batch_number, quantity=s.quantity,
        remaining_quantity=s.remaining_quantity, unit_cost=s.unit_cost,
        supplier_name=s.supplier.name if s.supplier else None, expiry_date=s.expiry_date,
        intake_date=s.intake_date, created_at=s.created_at,
    ) for s in si_rows]

    # Menu Item Variants
    var_stmt = (
        select(MenuItemVariant)
        .join(MenuItem, MenuItemVariant.menu_item_id == MenuItem.id)
        .where(MenuItem.outlet_id == outlet_id)
    )
    var_rows = (await db.execute(var_stmt)).scalars().all()
    var_list = [MenuItemVariantSnapshot(
        id=v.id, menu_item_id=v.menu_item_id, name=v.name,
        price_delta=v.price_delta, is_available=v.is_available,
    ) for v in var_rows]

    # Menu Item Recipes (for stock auto-deduction during billing)
    recipe_stmt = (
        select(MenuItemRecipe)
        .join(MenuItem, MenuItemRecipe.menu_item_id == MenuItem.id)
        .where(MenuItem.outlet_id == outlet_id)
    )
    recipe_rows = (await db.execute(recipe_stmt)).scalars().all()
    recipe_list = [MenuItemRecipeSnapshot(
        id=r.id, menu_item_id=r.menu_item_id,
        inventory_item_id=r.inventory_item_id,
        quantity_required=r.quantity_required,
        unit=r.unit.value if hasattr(r.unit, 'value') else r.unit,
    ) for r in recipe_rows]

    # Customers
    cust_stmt = select(Customer).where(Customer.outlet_id == outlet_id)
    if not is_full and since_naive is not None:
        cust_stmt = cust_stmt.where(Customer.updated_at > since_naive)
    cust_rows = (await db.execute(cust_stmt)).scalars().all()
    cust_list = [CustomerSnapshot(
        id=c.id, name=c.name, phone=c.phone, outlet_id=c.outlet_id,
        updated_at=c.updated_at,
    ) for c in cust_rows]

    # Suppliers
    sup_stmt = select(Supplier).where(Supplier.outlet_id == outlet_id)
    if not is_full and since_naive is not None:
        sup_stmt = sup_stmt.where(Supplier.created_at > since_naive)
    sup_rows = (await db.execute(sup_stmt)).scalars().all()
    sup_list = [SupplierSnapshot(
        id=s.id, name=s.name, phone=s.phone, outlet_id=s.outlet_id,
        created_at=s.created_at,
    ) for s in sup_rows]

    return SnapshotResponse(
        outlet=OutletConfigSnapshot(
            id=outlet.id, name=outlet.name, slug=outlet.slug,
            payment_mode=outlet.payment_mode.value if hasattr(outlet.payment_mode, 'value') else outlet.payment_mode,
            address=outlet.address, phone=outlet.phone, gstin=outlet.gstin, fssai_no=outlet.fssai_no,
            direct_upi_id=outlet.direct_upi_id, raw_upi_payload=outlet.raw_upi_payload,
            evening_price_active=outlet.evening_price_active,
            evening_pricing_mode=outlet.evening_pricing_mode,
            near_expiry_threshold_days=outlet.near_expiry_threshold_days,
            verification_amount_cutoff=outlet.verification_amount_cutoff,
            logo_url=outlet.logo_url,
        ),
        categories=[CategorySnapshot(id=c.id, name=c.name, display_order=c.display_order, updated_at=c.updated_at) for c in cats],
        menu_items=menu_items,
        menu_item_variants=var_list,
        menu_item_recipes=recipe_list,
        staff=staff_list,
        inventory_items=inv_list,
        stock_intakes=si_list,
        customers=cust_list,
        suppliers=sup_list,
        generated_at=datetime.now(timezone.utc),
        is_full=is_full,
    )


async def process_sync_actions_batch(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    actions: list[SyncAction],
) -> list[SyncActionResult]:
    """
    Process a batch of offline actions in order, with full idempotency.
    Reuses existing billing/inventory service functions — no parallel implementation.
    """
    results: list[SyncActionResult] = []

    for action in actions:
        # Idempotency check: has this action already been processed?
        existing = await db.execute(
            select(SyncActionLog).where(
                SyncActionLog.outlet_id == outlet_id,
                SyncActionLog.client_action_id == action.client_action_id,
            )
        )
        existing_log = existing.scalar_one_or_none()

        if existing_log:
            results.append(SyncActionResult(
                client_action_id=action.client_action_id,
                status="skipped",
                detail="Already processed",
                result=existing_log.result_snapshot,
            ))
            continue

        # Dispatch to handler based on action_type
        try:
            result_data = await _dispatch_sync_action(db, outlet_id, action)
            log_entry = SyncActionLog(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                client_action_id=action.client_action_id,
                action_type=action.action_type,
                action_timestamp=action.action_timestamp,
                payload=action.payload,
                status="applied",
                result_snapshot=result_data,
            )
            db.add(log_entry)
            await db.flush()

            results.append(SyncActionResult(
                client_action_id=action.client_action_id,
                status="applied",
                result=result_data,
            ))

        except Exception as e:
            log_entry = SyncActionLog(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                client_action_id=action.client_action_id,
                action_type=action.action_type,
                action_timestamp=action.action_timestamp,
                payload=action.payload,
                status="failed",
                error_detail=str(e),
            )
            db.add(log_entry)
            await db.flush()

            results.append(SyncActionResult(
                client_action_id=action.client_action_id,
                status="failed",
                detail=str(e),
            ))

    return results


async def _dispatch_sync_action(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    action: SyncAction,
) -> dict[str, Any] | None:
    """
    Route action to existing service function based on action_type.
    IMPORTANT: reuse existing billing_service / inventory_service functions.
    """
    payload = action.payload

    if action.action_type == "bill_created":
        from app.services.billing_service import create_manual_bill
        from app.schemas.billing import CreateManualBillRequest
        class _SyncUser:
            def __init__(self, uid, oid):
                self.user_id = uid
                self.id = uid
                self.outlet_id = oid
                self.role = "CASHIER"
        staff_id = uuid.UUID(payload["staff_id"]) if payload.get("staff_id") else uuid.uuid4()
        user = _SyncUser(staff_id, outlet_id)
        bill_data = CreateManualBillRequest(**payload["bill_data"])
        local_order_id = uuid.UUID(payload["local_order_id"]) if payload.get("local_order_id") else None
        order = await create_manual_bill(db, outlet_id, user, bill_data, order_id=local_order_id)
        return {"order_id": str(order.id), "invoice_number": order.basket_number}

    elif action.action_type == "bill_finalized":
        from app.services.billing_service import finalize_bill
        order_id = uuid.UUID(payload["order_id"])
        await finalize_bill(db, order_id, outlet_id)
        return {"order_id": payload["order_id"]}

    elif action.action_type == "payment_confirmed":
        from app.services.billing_service import mark_bill_paid
        from app.schemas.billing import MarkPaidRequest
        order_id = uuid.UUID(payload["order_id"])
        pay_data = MarkPaidRequest(**payload["payment_data"])
        order = await mark_bill_paid(
            db, order_id, outlet_id,
            payment_method=pay_data.payment_method,
            cash_denominations=pay_data.cash_denominations,
        )
        if payload.get("confirmed_offline") and order:
            order.confirmed_offline = True
            flag = SyncConflictFlag(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                conflict_type="offline_payment",
                description=f"Payment for order {order.basket_number} confirmed offline by staff",
                details={"order_id": str(order.id), "amount": str(order.total_amount), "method": pay_data.payment_method},
            )
            db.add(flag)
        return {"order_id": payload["order_id"], "confirmed_offline": payload.get("confirmed_offline", False)}

    elif action.action_type == "stock_deducted":
        from app.models.inventory_item import InventoryItem
        item_id = uuid.UUID(payload["item_id"])
        qty = Decimal(str(payload["quantity"]))
        inv_item = await db.get(InventoryItem, item_id)
        if inv_item:
            inv_item.current_stock -= qty
            if inv_item.current_stock < Decimal("0.000"):
                flag = SyncConflictFlag(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    conflict_type="negative_stock",
                    description=f"Stock for '{inv_item.name}' went negative ({inv_item.current_stock}) after synced deduction of {qty}",
                    details={"item_id": str(item_id), "item_name": inv_item.name, "deducted": str(qty), "resulting_stock": str(inv_item.current_stock)},
                )
                db.add(flag)
        return {"item_id": payload["item_id"], "quantity_deducted": str(qty)}

    elif action.action_type == "discount_applied":
        from app.services.billing_service import apply_discount
        from app.schemas.billing import ApplyDiscountRequest
        order_id = uuid.UUID(payload["order_id"])
        disc_data = ApplyDiscountRequest(**payload["discount_data"])
        class _SyncStaff:
            def __init__(self, uid, oid):
                self.user_id = uid
                self.id = uid
                self.outlet_id = oid
                self.role = "CASHIER"
        staff_id = uuid.UUID(payload["staff_id"]) if payload.get("staff_id") else uuid.uuid4()
        user = _SyncStaff(staff_id, outlet_id)
        await apply_discount(db, order_id, outlet_id, user, disc_data)
        return {"order_id": payload["order_id"]}

    elif action.action_type == "customer_return":
        from app.services.billing_service import process_customer_return
        class _SyncUser:
            def __init__(self, uid, oid):
                self.user_id = uid
                self.outlet_id = oid
                self.role = "CASHIER"
        staff_id = uuid.UUID(payload["staff_id"]) if payload.get("staff_id") else uuid.uuid4()
        user = _SyncUser(staff_id, outlet_id)
        from app.schemas.billing import CustomerReturnRequest
        ret_data = CustomerReturnRequest(**payload["return_data"])
        result = await process_customer_return(db, outlet_id, user, ret_data)
        return {"return_result": "processed"}

    else:
        raise ValueError(f"Unknown sync action_type: '{action.action_type}'")


async def get_sync_status(
    db: AsyncSession,
    outlet_id: uuid.UUID,
) -> SyncStatusResponse:
    """Get the sync status for an outlet."""
    outlet = await db.get(Outlet, outlet_id)
    if not outlet:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Outlet not found")

    last_sync_res = await db.execute(
        select(func.max(SyncActionLog.synced_at)).where(SyncActionLog.outlet_id == outlet_id)
    )
    last_sync_at = last_sync_res.scalar_one_or_none()

    conflict_count_res = await db.execute(
        select(func.count(SyncConflictFlag.id)).where(
            SyncConflictFlag.outlet_id == outlet_id,
            SyncConflictFlag.is_resolved == False,
        )
    )
    pending_count = conflict_count_res.scalar_one() or 0

    return SyncStatusResponse(
        outlet_id=outlet_id,
        outlet_name=outlet.name,
        last_sync_at=last_sync_at,
        pending_conflict_count=pending_count,
        server_time=datetime.now(timezone.utc),
    )
