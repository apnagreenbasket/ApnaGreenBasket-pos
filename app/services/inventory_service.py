"""
Inventory service — recipe-based auto-deduction, stock intake logging, ledger tracking, and cancellation reversals.
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Sequence

logger = logging.getLogger(__name__)

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from datetime import datetime, timezone, timedelta

from app.models.enums import InventoryUnitEnum, StockChangeTypeEnum, MarginTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.order import Order
from app.core.datetime_utils import utc_now, ensure_naive_utc
from app.core.shift_utils import IST
from app.models.order_item import OrderItem
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.supplier import Supplier
from app.schemas.inventory import (
    BatchUpdateMetadataRequest,
    InventoryItemCreate,
    InventoryItemUpdate,
    RecipeSaveRequest,
    StockIntakeCreate,
    StockWastageRequest,
)


def get_unit_conversion_multiplier(
    selected_unit: str | None,
    inv_item: InventoryItem | None = None,
    menu_item: Any | None = None,
) -> Decimal:
    """
    Calculate the conversion multiplier from the sold/selected unit to the base inventory unit.
    For example, if base unit is "piece" and alternate unit is 1 "pair" = 2 "piece",
    calling with selected_unit="pair" returns Decimal("2.0").
    If selected_unit is the base unit (or None/empty), returns Decimal("1.0").
    """
    if not selected_unit or not str(selected_unit).strip():
        return Decimal("1.0")

    unit_clean = str(selected_unit).strip().lower()

    # Determine base unit
    base_unit = None
    if inv_item and getattr(inv_item, "unit", None):
        base_unit = str(inv_item.unit).strip().lower()
    elif menu_item and getattr(menu_item, "unit_label", None):
        base_unit = str(menu_item.unit_label).strip().lower()

    # If selected unit matches base unit directly, multiplier is 1.0
    if base_unit and unit_clean == base_unit:
        return Decimal("1.0")

    # Common unit synonyms that represent 1.0 base unit
    piece_synonyms = {"pc", "pcs", "piece", "pieces", "unit", "units", "nos", "no"}
    if base_unit in piece_synonyms and unit_clean in piece_synonyms:
        return Decimal("1.0")

    weight_kg_synonyms = {"kg", "kgs", "kilogram", "kilograms"}
    if base_unit in weight_kg_synonyms and unit_clean in weight_kg_synonyms:
        return Decimal("1.0")

    weight_g_synonyms = {"g", "gm", "gms", "gram", "grams"}
    if base_unit in weight_g_synonyms and unit_clean in weight_g_synonyms:
        return Decimal("1.0")

    volume_l_synonyms = {"l", "ltr", "liter", "liters", "litre", "litres"}
    if base_unit in volume_l_synonyms and unit_clean in volume_l_synonyms:
        return Decimal("1.0")

    volume_ml_synonyms = {"ml", "milliliter", "milliliters", "millilitre"}
    if base_unit in volume_ml_synonyms and unit_clean in volume_ml_synonyms:
        return Decimal("1.0")

    # 1. Search in MenuItem.alternate_units or InventoryItem.alternate_units
    sources: list[list[dict[str, Any]]] = []
    if menu_item and getattr(menu_item, "alternate_units", None):
        sources.append(menu_item.alternate_units)
    if inv_item and getattr(inv_item, "alternate_units", None):
        sources.append(inv_item.alternate_units)

    for alt_list in sources:
        if not isinstance(alt_list, list):
            continue
        for alt in alt_list:
            if not isinstance(alt, dict):
                continue
            lbl = str(alt.get("unit_label", "")).strip().lower()
            if lbl == unit_clean:
                cf = alt.get("conversion_factor")
                if cf is not None:
                    try:
                        val = Decimal(str(cf))
                        if val > Decimal("0.000"):
                            return Decimal("1.0") / val
                    except Exception:
                        pass

    # 2. Universal Metric & Packaging Fallbacks
    if unit_clean in {"pair", "pairs"}:
        return Decimal("2.0")
    if unit_clean in {"dozen", "doz"}:
        return Decimal("12.0")
    if unit_clean in {"half dozen", "half-dozen", "half doz"}:
        return Decimal("6.0")

    if base_unit in weight_kg_synonyms and unit_clean in weight_g_synonyms:
        return Decimal("0.001")
    if base_unit in weight_g_synonyms and unit_clean in weight_kg_synonyms:
        return Decimal("1000.0")

    if base_unit in volume_l_synonyms and unit_clean in volume_ml_synonyms:
        return Decimal("0.001")
    if base_unit in volume_ml_synonyms and unit_clean in volume_l_synonyms:
        return Decimal("1000.0")

    return Decimal("1.0")


async def process_order_auto_deduction(
    db: AsyncSession,
    order: Order,
) -> None:
    """
    Auto-deduct stock for an order based on recipe mappings.
    Triggers when order enters PAID or PREPARING state.
    Deducts stock at the BATCH level in FIFO order by earliest expiry_date.
    Does NOT block order fulfillment if aggregate stock goes negative.
    Converts alternate units (e.g. 1 pair = 2 pieces) to base inventory unit.
    """
    # Check if already deducted
    existing = await db.execute(
        select(StockLedger).where(
            StockLedger.reference_order_id == order.id,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
        )
    )
    if existing.scalars().first() is not None:
        return

    # Ensure order items are loaded safely without triggering greenlet lazy-load
    items_res = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id)
    )
    order_items = items_res.scalars().all()

    for item in order_items:
        if not item.menu_item_id:
            continue

        # Fetch recipe for this menu item
        recipe_res = await db.execute(
            select(MenuItemRecipe).where(
                MenuItemRecipe.menu_item_id == item.menu_item_id
            )
        )
        recipes = recipe_res.scalars().all()

        if recipes:
            # ── Type B: Recipe / Composite Product Deduction ─────────────────────
            from app.models.menu_item import MenuItem
            mi_res = await db.execute(
                select(MenuItem).where(MenuItem.id == item.menu_item_id)
            )
            menu_item_obj = mi_res.scalar_one_or_none()

            unit_multiplier = get_unit_conversion_multiplier(
                selected_unit=getattr(item, "selected_unit", None),
                inv_item=None,
                menu_item=menu_item_obj,
            )

            for recipe in recipes:
                deduct_qty = (
                    Decimal(str(recipe.quantity_required))
                    * Decimal(str(item.quantity))
                    * unit_multiplier
                )

                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.id == recipe.inventory_item_id,
                        InventoryItem.outlet_id == order.outlet_id,
                    )
                )
                inv_item = inv_res.scalar_one_or_none()
                if not inv_item:
                    continue

                inv_item.current_stock = inv_item.current_stock - deduct_qty

                # FIFO batch stock drawdown by oldest intake date
                batches_res = await db.execute(
                    select(StockIntake)
                    .where(
                        StockIntake.item_id == inv_item.id,
                        StockIntake.outlet_id == order.outlet_id,
                        StockIntake.remaining_quantity > Decimal("0.000"),
                    )
                    .order_by(
                        StockIntake.intake_date.asc(),
                        StockIntake.created_at.asc(),
                    )
                )
                batches = batches_res.scalars().all()

                needed = deduct_qty
                for batch in batches:
                    if needed <= Decimal("0.000"):
                        break
                    take = min(batch.remaining_quantity, needed)
                    batch.remaining_quantity = batch.remaining_quantity - take
                    needed = needed - take

                    db.add(StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=inv_item.id,
                        intake_id=batch.id,
                        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                        quantity_change=-take,
                        resulting_stock=inv_item.current_stock,
                        batch_balance=batch.remaining_quantity,
                        reference_order_id=order.id,
                        unit_cost_snapshot=batch.unit_cost,
                    ))

                # If needed > 0 remains (unbatched POS overselling balance)
                if needed > Decimal("0.000"):
                    latest_res = await db.execute(
                        select(StockIntake)
                        .where(
                            StockIntake.item_id == inv_item.id,
                            StockIntake.outlet_id == order.outlet_id,
                        )
                        .order_by(StockIntake.intake_date.desc(), StockIntake.created_at.desc())
                    )
                    latest_b = latest_res.scalars().first()
                    ov_batch_num = generate_oversold_batch_number(latest_b.batch_number if latest_b else None)
                    ref_cost = latest_b.unit_cost if latest_b else inv_item.cost_per_unit
                    ref_retail = latest_b.retail_price if latest_b else inv_item.retail_price
                    ref_mrp = latest_b.mrp if latest_b else inv_item.mrp
                    ref_wholesale = latest_b.wholesale_price if latest_b else inv_item.wholesale_price

                    new_neg_batch = StockIntake(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=inv_item.id,
                        batch_number=ov_batch_num,
                        quantity=-needed,
                        initial_quantity=Decimal("0.000"),
                        remaining_quantity=-needed,
                        unit_cost=ref_cost,
                        retail_price=ref_retail,
                        mrp=ref_mrp,
                        wholesale_price=ref_wholesale,
                        supplier_id=latest_b.supplier_id if latest_b else None,
                        intake_date=utc_now(),
                        expiry_date=latest_b.expiry_date if latest_b else None,
                        notes=f"Auto-created oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                    )
                    db.add(new_neg_batch)
                    db.add(StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=inv_item.id,
                        intake_id=new_neg_batch.id,
                        change_type=StockChangeTypeEnum.OVERSOLD,
                        quantity_change=-needed,
                        resulting_stock=inv_item.current_stock,
                        batch_balance=new_neg_batch.remaining_quantity,
                        reference_order_id=order.id,
                        unit_cost_snapshot=ref_cost,
                        notes=f"POS oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                    ))

                await sync_item_prices_from_oldest_batch(db, inv_item.id, order.outlet_id)
        else:
            # ── Type A: Direct 1:1 Product Deduction Fallback ───────────────────
            from app.models.menu_item import MenuItem
            mi_res = await db.execute(
                select(MenuItem).where(MenuItem.id == item.menu_item_id)
            )
            menu_item_obj = mi_res.scalar_one_or_none()
            if not menu_item_obj:
                continue

            target_inv_item: InventoryItem | None = None
            if menu_item_obj.inventory_item_id:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.id == menu_item_obj.inventory_item_id,
                        InventoryItem.outlet_id == order.outlet_id,
                    )
                )
                target_inv_item = inv_res.scalar_one_or_none()
            elif menu_item_obj.barcode:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.outlet_id == order.outlet_id,
                        InventoryItem.barcode == menu_item_obj.barcode,
                    )
                )
                target_inv_item = inv_res.scalar_one_or_none()

            if not target_inv_item:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.outlet_id == order.outlet_id,
                        InventoryItem.name.ilike(menu_item_obj.name.strip()),
                    )
                )
                target_inv_item = inv_res.scalar_one_or_none()

            if not target_inv_item:
                continue

            if not menu_item_obj.inventory_item_id:
                menu_item_obj.inventory_item_id = target_inv_item.id

            unit_multiplier = get_unit_conversion_multiplier(
                selected_unit=getattr(item, "selected_unit", None),
                inv_item=target_inv_item,
                menu_item=menu_item_obj,
            )
            deduct_qty = Decimal(str(item.quantity)) * unit_multiplier
            if not getattr(target_inv_item, "allow_oversell", True) and (target_inv_item.current_stock < deduct_qty):
                raise HTTPException(
                    status_code=400,
                    detail=f"Item '{target_inv_item.name}' does not allow overselling and has only {max(Decimal('0'), target_inv_item.current_stock)} in stock."
                )
            target_inv_item.current_stock = target_inv_item.current_stock - deduct_qty

            selected_b_uuid = getattr(item, "selected_batch_id", None)
            if selected_b_uuid:
                # ── EXPLICIT BATCH SELECTION DEDUCTION (NOT FIFO) ──
                b_res = await db.execute(
                    select(StockIntake).where(
                        StockIntake.id == selected_b_uuid,
                        StockIntake.outlet_id == order.outlet_id,
                    )
                )
                chosen_batch = b_res.scalar_one_or_none()
                if chosen_batch:
                    avail = max(Decimal("0.000"), chosen_batch.remaining_quantity)
                    if deduct_qty <= avail:
                        chosen_batch.remaining_quantity = chosen_batch.remaining_quantity - deduct_qty
                        db.add(StockLedger(
                            id=uuid.uuid4(),
                            outlet_id=order.outlet_id,
                            item_id=target_inv_item.id,
                            intake_id=chosen_batch.id,
                            change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                            quantity_change=-deduct_qty,
                            resulting_stock=target_inv_item.current_stock,
                            batch_balance=chosen_batch.remaining_quantity,
                            reference_order_id=order.id,
                            unit_cost_snapshot=chosen_batch.unit_cost,
                        ))
                    else:
                        deficit = deduct_qty - avail
                        if avail > Decimal("0.000"):
                            chosen_batch.remaining_quantity = Decimal("0.000")
                            db.add(StockLedger(
                                id=uuid.uuid4(),
                                outlet_id=order.outlet_id,
                                item_id=target_inv_item.id,
                                intake_id=chosen_batch.id,
                                change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                                quantity_change=-avail,
                                resulting_stock=target_inv_item.current_stock,
                                batch_balance=Decimal("0.000"),
                                reference_order_id=order.id,
                                unit_cost_snapshot=chosen_batch.unit_cost,
                            ))

                        # Draw excess from newer positive batches if this was an older batch (FIFO rollover)
                        rem_deficit = deficit
                        other_res = await db.execute(
                            select(StockIntake)
                            .where(
                                StockIntake.item_id == target_inv_item.id,
                                StockIntake.outlet_id == order.outlet_id,
                                StockIntake.remaining_quantity > Decimal("0.000"),
                                StockIntake.id != chosen_batch.id,
                            )
                            .order_by(StockIntake.intake_date.asc(), StockIntake.created_at.asc())
                        )
                        all_other = other_res.scalars().all()
                        # Only rollover to batches chronologically newer than chosen_batch
                        newer_batches = [
                            b for b in all_other
                            if (b.intake_date > chosen_batch.intake_date) or 
                               (b.intake_date == chosen_batch.intake_date and b.created_at > chosen_batch.created_at)
                        ]
                        for nb in newer_batches:
                            if rem_deficit <= Decimal("0.000"):
                                break
                            take = min(nb.remaining_quantity, rem_deficit)
                            nb.remaining_quantity = nb.remaining_quantity - take
                            rem_deficit = rem_deficit - take
                            db.add(StockLedger(
                                id=uuid.uuid4(),
                                outlet_id=order.outlet_id,
                                item_id=target_inv_item.id,
                                intake_id=nb.id,
                                change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                                quantity_change=-take,
                                resulting_stock=target_inv_item.current_stock,
                                batch_balance=nb.remaining_quantity,
                                reference_order_id=order.id,
                                unit_cost_snapshot=nb.unit_cost,
                            ))

                        # If rem_deficit > 0 remains after exhausting all positive batches, only latest batch oversells
                        if rem_deficit > Decimal("0.000"):
                            latest_res = await db.execute(
                                select(StockIntake)
                                .where(
                                    StockIntake.item_id == target_inv_item.id,
                                    StockIntake.outlet_id == order.outlet_id,
                                )
                                .order_by(StockIntake.intake_date.desc(), StockIntake.created_at.desc())
                            )
                            latest_batch = latest_res.scalars().first() or chosen_batch

                            # Consolidate into existing oversold batch if one already exists in db.new or in DB
                            existing_ov_batch = None
                            for obj in db.new:
                                if isinstance(obj, StockIntake) and obj.item_id == target_inv_item.id and (obj.remaining_quantity or Decimal("0.000")) < Decimal("0.000"):
                                    existing_ov_batch = obj
                                    break

                            if not existing_ov_batch:
                                db_neg_res = await db.execute(
                                    select(StockIntake)
                                    .where(
                                        StockIntake.item_id == target_inv_item.id,
                                        StockIntake.outlet_id == order.outlet_id,
                                        StockIntake.remaining_quantity < Decimal("0.000"),
                                    )
                                    .order_by(StockIntake.created_at.desc())
                                )
                                existing_ov_batch = db_neg_res.scalars().first()

                            if existing_ov_batch:
                                existing_ov_batch.quantity = (existing_ov_batch.quantity or Decimal("0.000")) - rem_deficit
                                existing_ov_batch.remaining_quantity = (existing_ov_batch.remaining_quantity or Decimal("0.000")) - rem_deficit
                                db.add(StockLedger(
                                    id=uuid.uuid4(),
                                    outlet_id=order.outlet_id,
                                    item_id=target_inv_item.id,
                                    intake_id=existing_ov_batch.id,
                                    change_type=StockChangeTypeEnum.OVERSOLD,
                                    quantity_change=-rem_deficit,
                                    resulting_stock=target_inv_item.current_stock,
                                    batch_balance=existing_ov_batch.remaining_quantity,
                                    reference_order_id=order.id,
                                    unit_cost_snapshot=latest_batch.unit_cost,
                                    notes=f"POS oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                                ))
                            else:
                                ov_batch_num = generate_oversold_batch_number()
                                new_neg_batch = StockIntake(
                                    id=uuid.uuid4(),
                                    outlet_id=order.outlet_id,
                                    item_id=target_inv_item.id,
                                    batch_number=ov_batch_num,
                                    quantity=-rem_deficit,
                                    initial_quantity=Decimal("0.000"),
                                    remaining_quantity=-rem_deficit,
                                    unit_cost=latest_batch.unit_cost,
                                    retail_price=latest_batch.retail_price,
                                    mrp=latest_batch.mrp,
                                    wholesale_price=latest_batch.wholesale_price,
                                    supplier_id=latest_batch.supplier_id,
                                    intake_date=utc_now(),
                                    expiry_date=latest_batch.expiry_date,
                                    notes=f"Auto-created oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                                )
                                db.add(new_neg_batch)
                                db.add(StockLedger(
                                    id=uuid.uuid4(),
                                    outlet_id=order.outlet_id,
                                    item_id=target_inv_item.id,
                                    intake_id=new_neg_batch.id,
                                    change_type=StockChangeTypeEnum.OVERSOLD,
                                    quantity_change=-rem_deficit,
                                    resulting_stock=target_inv_item.current_stock,
                                    batch_balance=new_neg_batch.remaining_quantity,
                                    reference_order_id=order.id,
                                    unit_cost_snapshot=latest_batch.unit_cost,
                                    notes=f"POS oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                                ))
                            ov_b = existing_ov_batch or new_neg_batch
                            if not item.selected_batch_id:
                                item.selected_batch_id = ov_b.id
                    await sync_item_prices_from_oldest_batch(db, target_inv_item.id, order.outlet_id)
                    continue

            # FIFO batch stock drawdown by oldest intake date
            batches_res = await db.execute(
                select(StockIntake)
                .where(
                    StockIntake.item_id == target_inv_item.id,
                    StockIntake.outlet_id == order.outlet_id,
                    StockIntake.remaining_quantity > Decimal("0.000"),
                )
                .order_by(
                    StockIntake.intake_date.asc(),
                    StockIntake.created_at.asc(),
                )
            )
            batches = batches_res.scalars().all()

            needed = deduct_qty
            for batch in batches:
                if needed <= Decimal("0.000"):
                    break
                take = min(batch.remaining_quantity, needed)
                batch.remaining_quantity = batch.remaining_quantity - take
                needed = needed - take

                db.add(StockLedger(
                    id=uuid.uuid4(),
                    outlet_id=order.outlet_id,
                    item_id=target_inv_item.id,
                    intake_id=batch.id,
                    change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
                    quantity_change=-take,
                    resulting_stock=target_inv_item.current_stock,
                    batch_balance=batch.remaining_quantity,
                    reference_order_id=order.id,
                    unit_cost_snapshot=batch.unit_cost,
                ))

            if needed > Decimal("0.000"):
                # All batches exhausted -> check if existing negative batch exists in db.new or in DB
                latest_res = await db.execute(
                    select(StockIntake)
                    .where(
                        StockIntake.item_id == target_inv_item.id,
                        StockIntake.outlet_id == order.outlet_id,
                    )
                    .order_by(StockIntake.intake_date.desc(), StockIntake.created_at.desc())
                )
                latest_b = latest_res.scalars().first()
                ref_cost = latest_b.unit_cost if latest_b else target_inv_item.cost_per_unit
                ref_retail = latest_b.retail_price if latest_b else target_inv_item.retail_price
                ref_mrp = latest_b.mrp if latest_b else target_inv_item.mrp
                ref_wholesale = latest_b.wholesale_price if latest_b else target_inv_item.wholesale_price

                existing_ov_batch = None
                for obj in db.new:
                    if isinstance(obj, StockIntake) and obj.item_id == target_inv_item.id and (obj.remaining_quantity or Decimal("0.000")) < Decimal("0.000"):
                        existing_ov_batch = obj
                        break

                if not existing_ov_batch:
                    db_neg_res = await db.execute(
                        select(StockIntake)
                        .where(
                            StockIntake.item_id == target_inv_item.id,
                            StockIntake.outlet_id == order.outlet_id,
                            StockIntake.remaining_quantity < Decimal("0.000"),
                        )
                        .order_by(StockIntake.created_at.desc())
                    )
                    existing_ov_batch = db_neg_res.scalars().first()

                if existing_ov_batch:
                    existing_ov_batch.quantity = (existing_ov_batch.quantity or Decimal("0.000")) - needed
                    existing_ov_batch.remaining_quantity = (existing_ov_batch.remaining_quantity or Decimal("0.000")) - needed
                    db.add(StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=target_inv_item.id,
                        intake_id=existing_ov_batch.id,
                        change_type=StockChangeTypeEnum.OVERSOLD,
                        quantity_change=-needed,
                        resulting_stock=target_inv_item.current_stock,
                        batch_balance=existing_ov_batch.remaining_quantity,
                        reference_order_id=order.id,
                        unit_cost_snapshot=ref_cost,
                        notes=f"POS oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                    ))
                else:
                    ov_batch_num = generate_oversold_batch_number()
                    new_neg_batch = StockIntake(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=target_inv_item.id,
                        batch_number=ov_batch_num,
                        quantity=-needed,
                        initial_quantity=Decimal("0.000"),
                        remaining_quantity=-needed,
                        unit_cost=ref_cost,
                        retail_price=ref_retail,
                        mrp=ref_mrp,
                        wholesale_price=ref_wholesale,
                        supplier_id=latest_b.supplier_id if latest_b else None,
                        intake_date=utc_now(),
                        expiry_date=latest_b.expiry_date if latest_b else None,
                        notes=f"Auto-created oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                    )
                    db.add(new_neg_batch)
                    db.add(StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=order.outlet_id,
                        item_id=target_inv_item.id,
                        intake_id=new_neg_batch.id,
                        change_type=StockChangeTypeEnum.OVERSOLD,
                        quantity_change=-needed,
                        resulting_stock=target_inv_item.current_stock,
                        batch_balance=new_neg_batch.remaining_quantity,
                        reference_order_id=order.id,
                        unit_cost_snapshot=ref_cost,
                        notes=f"POS oversold deficit from Order #{order.basket_number or str(order.id)[:8]}",
                    ))
                ov_b = existing_ov_batch or new_neg_batch
                if not item.selected_batch_id:
                    item.selected_batch_id = ov_b.id

            # Automatically roll over prices if the positive batch reached 0
            await sync_item_prices_from_oldest_batch(db, target_inv_item.id, order.outlet_id)
            await reconcile_item_stock_from_batches(db, target_inv_item.id)

    await db.flush()


async def process_order_cancellation_reversal(
    db: AsyncSession,
    order: Order,
) -> None:
    """
    Reverse auto-deduction if an order is cancelled or refunded after stock deduction.
    Restores deducted quantities to current_stock and appends RESTOCK ledger entries.
    """
    # Fetch deduction entries for this order
    deductions_res = await db.execute(
        select(StockLedger).where(
            StockLedger.reference_order_id == order.id,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
        )
    )
    deductions = deductions_res.scalars().all()
    if not deductions:
        return  # Was never deducted

    # Check if already restocked
    restocked_res = await db.execute(
        select(StockLedger).where(
            StockLedger.reference_order_id == order.id,
            StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
        )
    )
    if restocked_res.scalars().first() is not None:
        return  # Already restocked

    for entry in deductions:
        restore_qty = abs(entry.quantity_change)

        inv_res = await db.execute(
            select(InventoryItem).where(
                InventoryItem.id == entry.item_id,
                InventoryItem.outlet_id == order.outlet_id,
            )
        )
        inv_item = inv_res.scalar_one_or_none()
        if not inv_item:
            continue

        if entry.intake_id:
            batch = await db.get(StockIntake, entry.intake_id)
            if batch:
                batch.remaining_quantity = batch.remaining_quantity + restore_qty

        inv_item.current_stock = inv_item.current_stock + restore_qty

        restock_ledger = StockLedger(
            id=uuid.uuid4(),
            outlet_id=order.outlet_id,
            item_id=inv_item.id,
            intake_id=entry.intake_id,
            batch_balance=batch.remaining_quantity if batch else None,
            change_type=StockChangeTypeEnum.RESTOCK,
            quantity_change=restore_qty,
            resulting_stock=inv_item.current_stock,
            reference_order_id=order.id,
            unit_cost_snapshot=entry.unit_cost_snapshot or inv_item.cost_per_unit,
        )
        db.add(restock_ledger)

    await db.flush()
    for entry in deductions:
        await reconcile_item_stock_from_batches(db, entry.item_id)


async def create_inventory_item(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: InventoryItemCreate,
) -> InventoryItem:
    """Create a new ingredient in the master list for an outlet."""
    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=data.name.trim() if hasattr(data.name, "trim") else data.name.strip(),
        unit=data.unit,
        category=data.category.strip() if data.category else "General",
        current_stock=data.current_stock,
        reorder_threshold=data.reorder_threshold,
        cost_per_unit=data.cost_per_unit,
        mrp=getattr(data, "mrp", None),
        tax_category=getattr(data, "tax_category", "GST 0%"),
        tax_rate=getattr(data, "tax_rate", Decimal("0.00")),
        shelf_life_alert_hrs=getattr(data, "shelf_life_alert_hrs", None),
        alternate_units=getattr(data, "alternate_units", []) or [],
        allow_oversell=getattr(data, "allow_oversell", True) if getattr(data, "allow_oversell", None) is not None else True,
        hsn_code=getattr(data, "hsn_code", None),
        is_active=True,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_inventory_item(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_id: uuid.UUID,
    data: InventoryItemUpdate,
) -> InventoryItem:
    """Update an ingredient master record."""
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    if data.name is not None:
        item.name = data.name.strip()
    if "barcode" in data.model_fields_set:
        item.barcode = data.barcode.strip() if data.barcode else None
    if data.unit is not None:
        item.unit = data.unit.strip().lower()
    
    cat_obj = None
    if data.category is not None:
        cat_name = data.category.strip()
        item.category = cat_name
        from app.models.category import Category
        cat_res = await db.execute(
            select(Category).where(
                Category.outlet_id == outlet_id,
                Category.name.ilike(cat_name)
            )
        )
        cat_obj = cat_res.scalars().first()
        if not cat_obj:
            cat_obj = Category(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                name=cat_name,
                display_order=0,
            )
            db.add(cat_obj)
            await db.flush()

    if data.current_stock is not None:
        has_batches_res = await db.execute(
            select(func.count(StockIntake.id)).where(StockIntake.item_id == item.id)
        )
        batch_count = has_batches_res.scalar() or 0
        if batch_count == 0:
            item.current_stock = data.current_stock
        else:
            await reconcile_item_stock_from_batches(db, item.id)
    if data.reorder_threshold is not None:
        item.reorder_threshold = data.reorder_threshold
    if data.cost_per_unit is not None:
        item.cost_per_unit = data.cost_per_unit
    if getattr(data, "mrp", None) is not None:
        item.mrp = data.mrp
    if getattr(data, "tax_category", None) is not None:
        item.tax_category = data.tax_category
    if getattr(data, "tax_rate", None) is not None:
        item.tax_rate = data.tax_rate
    if getattr(data, "shelf_life_alert_hrs", None) is not None:
        item.shelf_life_alert_hrs = data.shelf_life_alert_hrs
    if getattr(data, "retail_price", None) is not None:
        item.retail_price = data.retail_price
    if getattr(data, "wholesale_price", None) is not None:
        item.wholesale_price = data.wholesale_price
    if getattr(data, "margin_type", None) is not None:
        item.margin_type = data.margin_type
    if getattr(data, "retail_margin_pct", None) is not None:
        item.retail_margin_pct = data.retail_margin_pct
    if getattr(data, "mrp_margin_pct", None) is not None:
        item.mrp_margin_pct = data.mrp_margin_pct
    if getattr(data, "wholesale_margin_pct", None) is not None:
        item.wholesale_margin_pct = data.wholesale_margin_pct
    if "hsn_code" in data.model_fields_set:
        item.hsn_code = data.hsn_code.strip() if data.hsn_code else None
    if data.is_active is not None:
        item.is_active = data.is_active

    if getattr(data, "allow_oversell", None) is not None:
        item.allow_oversell = data.allow_oversell

    if getattr(data, "alternate_units", None) is not None:
        item.alternate_units = data.alternate_units

    if any(getattr(data, k, None) is not None for k in ("retail_price", "mrp", "wholesale_price")):
        await sync_oldest_batch_prices_from_item(
            db,
            item.id,
            outlet_id,
            retail_price=item.retail_price,
            mrp=item.mrp,
            wholesale_price=item.wholesale_price,
        )

    # Sync to linked MenuItem(s)
    from app.models.menu_item import MenuItem
    mi_res = await db.execute(
        select(MenuItem).where(
            MenuItem.outlet_id == outlet_id,
            MenuItem.inventory_item_id == item.id,
        )
    )
    linked_mis = list(mi_res.scalars().all())

    # If not linked by ID, attempt to link matching MenuItem by name
    if not linked_mis and item.name:
        mi_name_res = await db.execute(
            select(MenuItem).where(
                MenuItem.outlet_id == outlet_id,
                MenuItem.name.ilike(item.name),
            )
        )
        by_name = mi_name_res.scalars().first()
        if by_name:
            by_name.inventory_item_id = item.id
            linked_mis.append(by_name)

    for mi in linked_mis:
        if data.name is not None:
            mi.name = item.name
        if "barcode" in data.model_fields_set:
            mi.barcode = item.barcode
        if cat_obj is not None:
            mi.category_id = cat_obj.id
        if "hsn_code" in data.model_fields_set:
            mi.hsn_code = item.hsn_code
        if getattr(data, "tax_category", None) is not None:
            mi.tax_category = item.tax_category
        if getattr(data, "tax_rate", None) is not None:
            mi.tax_rate = item.tax_rate
        if data.unit is not None:
            mi.unit_label = item.unit
        if getattr(data, "alternate_units", None) is not None:
            mi.alternate_units = item.alternate_units
        if getattr(data, "allow_oversell", None) is not None:
            mi.allow_oversell = item.allow_oversell
        if getattr(data, "mrp", None) is not None:
            mi.mrp = item.mrp
        if getattr(data, "retail_price", None) is not None and data.retail_price is not None:
            mi.price = item.retail_price
        if getattr(data, "wholesale_price", None) is not None:
            mi.wholesale_price = item.wholesale_price

    from app.services.menu_service import invalidate_outlet_menu
    await invalidate_outlet_menu(db, outlet_id)

    await db.flush()
    await db.commit()
    await db.refresh(item)

    try:
        from app.services.websocket_service import broadcast_catalog_updated
        await broadcast_catalog_updated(outlet_id, reason="INVENTORY_ITEM_UPDATED", item_id=str(item.id))
    except Exception:
        pass

    return item


def generate_batch_number(prefix: str = "BAT") -> str:
    """Generate a unique batch number, e.g. BAT-16092026-AB12 (DDMMYYYY)."""
    date_str = datetime.now(IST).strftime("%d%m%Y")
    random_suffix = uuid.uuid4().hex[:4].upper()
    return f"{prefix}-{date_str}-{random_suffix}"


def generate_oversold_batch_number(parent_batch_number: str | None = None) -> str:
    """Generate a clean unique oversold batch number, e.g. BAT-OV-16092026-AB12 (DDMMYYYY, never chained)."""
    date_str = datetime.now(IST).strftime("%d%m%Y")
    random_suffix = uuid.uuid4().hex[:4].upper()
    return f"BAT-OV-{date_str}-{random_suffix}"


async def sync_item_prices_from_oldest_batch(
    db: AsyncSession,
    item_id: uuid.UUID,
    outlet_id: uuid.UUID,
) -> bool:
    """
    Ensures an inventory item and its linked MenuItem(s) reflect the prices
    and cost of the OLDEST positive batch (remaining_quantity > 0) in FEFO/FIFO order.
    If no positive batch exists, prices remain unchanged.
    """
    item = await db.get(InventoryItem, item_id)
    if not item or item.outlet_id != outlet_id:
        return False

    # Find the oldest positive batch (remaining_quantity > 0)
    batches_res = await db.execute(
        select(StockIntake)
        .where(
            StockIntake.item_id == item_id,
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > Decimal("0.000"),
        )
        .order_by(
            StockIntake.intake_date.asc(),
            StockIntake.created_at.asc(),
        )
    )
    oldest_batch = batches_res.scalars().first()
    if not oldest_batch:
        return False

    cost = oldest_batch.unit_cost

    def calc_price(margin_pct: Decimal | None) -> Decimal | None:
        if margin_pct is None or cost == Decimal("0.00"):
            return None
        if item.margin_type == MarginTypeEnum.MARKUP:
            return (cost + (cost * margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
        elif item.margin_type == MarginTypeEnum.MARGIN:
            if margin_pct >= Decimal("100"):
                return None
            return (cost / (Decimal("1") - margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
        return None

    target_retail = oldest_batch.retail_price if oldest_batch.retail_price is not None else calc_price(item.retail_margin_pct)
    target_mrp = oldest_batch.mrp if oldest_batch.mrp is not None else calc_price(item.mrp_margin_pct)
    target_wholesale = oldest_batch.wholesale_price if oldest_batch.wholesale_price is not None else calc_price(item.wholesale_margin_pct)

    price_changed = False
    if item.cost_per_unit != cost:
        item.cost_per_unit = cost
    if target_retail is not None and item.retail_price != target_retail:
        item.retail_price = target_retail
        price_changed = True
    if target_mrp is not None and item.mrp != target_mrp:
        item.mrp = target_mrp
        price_changed = True
    if target_wholesale is not None and item.wholesale_price != target_wholesale:
        item.wholesale_price = target_wholesale
        price_changed = True

    # Also update linked MenuItem(s)
    from app.models.menu_item import MenuItem
    menu_res = await db.execute(
        select(MenuItem).where(MenuItem.inventory_item_id == item.id)
    )
    for mi in menu_res.scalars().all():
        if target_retail is not None and mi.price != target_retail:
            mi.price = target_retail
            price_changed = True
        if target_mrp is not None and mi.mrp != target_mrp:
            mi.mrp = target_mrp
            price_changed = True
        if target_wholesale is not None and mi.wholesale_price != target_wholesale:
            mi.wholesale_price = target_wholesale
            price_changed = True

    if price_changed:
        from app.services.menu_service import invalidate_outlet_menu
        await invalidate_outlet_menu(db, outlet_id)
        try:
            from app.services.websocket_service import broadcast_catalog_updated
            await broadcast_catalog_updated(outlet_id, reason="BATCH_PRICE_ROLLOVER", item_id=str(item.id))
        except Exception:
            pass

    return price_changed


async def propagate_latest_batch_prices_to_all_batches(
    db: AsyncSession,
    item_id: uuid.UUID,
    outlet_id: uuid.UUID,
    new_batch: StockIntake,
) -> bool:
    """
    When latest_batch_price_override is ON for the outlet, propagate the
    new batch's MRP, selling price, and wholesale price to ALL other active
    batches (remaining_quantity > 0) of the same item, plus update the
    parent InventoryItem and linked MenuItem(s).
    """
    item = await db.get(InventoryItem, item_id)
    if not item or item.outlet_id != outlet_id:
        return False

    price_changed = False

    # Update all OTHER active batches to match the new batch's prices
    other_batches_res = await db.execute(
        select(StockIntake).where(
            StockIntake.item_id == item_id,
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > Decimal("0.000"),
            StockIntake.id != new_batch.id,
        )
    )
    for batch in other_batches_res.scalars().all():
        if new_batch.retail_price is not None and batch.retail_price != new_batch.retail_price:
            batch.retail_price = new_batch.retail_price
            price_changed = True
        if new_batch.mrp is not None and batch.mrp != new_batch.mrp:
            batch.mrp = new_batch.mrp
            price_changed = True
        if new_batch.wholesale_price is not None and batch.wholesale_price != new_batch.wholesale_price:
            batch.wholesale_price = new_batch.wholesale_price
            price_changed = True

    # Also sync the parent InventoryItem
    if new_batch.retail_price is not None and item.retail_price != new_batch.retail_price:
        item.retail_price = new_batch.retail_price
        price_changed = True
    if new_batch.mrp is not None and item.mrp != new_batch.mrp:
        item.mrp = new_batch.mrp
        price_changed = True
    if new_batch.wholesale_price is not None and item.wholesale_price != new_batch.wholesale_price:
        item.wholesale_price = new_batch.wholesale_price
        price_changed = True
    if new_batch.unit_cost is not None:
        item.cost_per_unit = new_batch.unit_cost

    # Also update linked MenuItem(s)
    from app.models.menu_item import MenuItem
    menu_res = await db.execute(
        select(MenuItem).where(MenuItem.inventory_item_id == item.id)
    )
    for mi in menu_res.scalars().all():
        if new_batch.retail_price is not None and mi.price != new_batch.retail_price:
            mi.price = new_batch.retail_price
            price_changed = True
        if new_batch.mrp is not None and mi.mrp != new_batch.mrp:
            mi.mrp = new_batch.mrp
            price_changed = True
        if new_batch.wholesale_price is not None and mi.wholesale_price != new_batch.wholesale_price:
            mi.wholesale_price = new_batch.wholesale_price
            price_changed = True

    if price_changed:
        from app.services.menu_service import invalidate_outlet_menu
        await invalidate_outlet_menu(db, outlet_id)
        try:
            from app.services.websocket_service import broadcast_catalog_updated
            await broadcast_catalog_updated(outlet_id, reason="LATEST_BATCH_PRICE_OVERRIDE", item_id=str(item.id))
        except Exception:
            pass

    return price_changed


async def sync_oldest_batch_prices_from_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    outlet_id: uuid.UUID,
    retail_price: Decimal | None = None,
    mrp: Decimal | None = None,
    wholesale_price: Decimal | None = None,
) -> StockIntake | None:
    """
    When selling price, MRP, or wholesale price is edited from Menu Item dashboard,
    Excel import, or Inventory Item master:
    Updates the OLDEST active positive batch (remaining_quantity > 0) following FIFO.
    Newer/upcoming batches remain untouched, preserving their own batch prices.
    When this oldest batch is later depleted, the next batch's prices will take over automatically.
    """
    batches_res = await db.execute(
        select(StockIntake)
        .where(
            StockIntake.item_id == item_id,
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > Decimal("0.000"),
        )
        .order_by(
            StockIntake.expiry_date.asc().nulls_last(),
            StockIntake.intake_date.asc(),
            StockIntake.created_at.asc(),
        )
    )
    oldest_batch = batches_res.scalars().first()
    if oldest_batch:
        if retail_price is not None:
            oldest_batch.retail_price = retail_price
        if mrp is not None:
            oldest_batch.mrp = mrp
        if wholesale_price is not None:
            oldest_batch.wholesale_price = wholesale_price
    return oldest_batch


async def absorb_deficit_into_new_batch(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item: InventoryItem,
    new_batch: StockIntake,
    user_id: uuid.UUID | None = None,
) -> Decimal:
    """
    If an item has open deficit batches (remaining_quantity < 0):
    1. Absorb deficit into the new inward batch, preserving initial_quantity and reducing remaining_quantity.
    2. Settle the deficit batch(es) towards 0.00, marking them settled.
    3. Record StockLedger audit entries:
       - AUTO_DEDUCTION against new_batch for pre-sold backorder fulfillment.
       - RESTOCK against deficit batch for settlement.
    4. Reconcile historical oversold ledger snapshots with the new actual unit cost.
    Returns total absorbed quantity.
    """
    if new_batch.remaining_quantity <= Decimal("0.000"):
        return Decimal("0.000")

    def_res = await db.execute(
        select(StockIntake)
        .where(
            StockIntake.item_id == item.id,
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity < Decimal("0.000"),
            StockIntake.id != new_batch.id,
        )
        .order_by(StockIntake.created_at.asc())
    )
    def_batches = def_res.scalars().all()
    if not def_batches:
        return Decimal("0.000")

    total_absorbed = Decimal("0.000")
    for def_b in def_batches:
        if new_batch.remaining_quantity <= Decimal("0.000"):
            break

        deficit_needed = abs(def_b.remaining_quantity)
        absorbed = min(new_batch.remaining_quantity, deficit_needed)
        if absorbed <= Decimal("0.000"):
            continue

        # Reduce remaining quantity on the new batch
        new_batch.remaining_quantity -= absorbed
        total_absorbed += absorbed

        # Settle the deficit batch
        def_b.remaining_quantity += absorbed
        def_b.unit_cost = new_batch.unit_cost
        if def_b.remaining_quantity == Decimal("0.000"):
            def_b.notes = (def_b.notes or "") + f" [Settled by Batch #{new_batch.batch_number}]"

        # Record auto-deduction from new batch (backorder fulfillment)
        db.add(StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=new_batch.id,
            change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
            quantity_change=-absorbed,
            resulting_stock=item.current_stock,
            batch_balance=new_batch.remaining_quantity,
            unit_cost_snapshot=new_batch.unit_cost,
            notes=f"Fulfilled pre-sold backorder #{def_b.batch_number}",
            created_by=user_id,
        ))

        # Record settlement on the deficit batch
        db.add(StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=def_b.id,
            change_type=StockChangeTypeEnum.RESTOCK,
            quantity_change=absorbed,
            resulting_stock=item.current_stock,
            batch_balance=def_b.remaining_quantity,
            unit_cost_snapshot=new_batch.unit_cost,
            notes=f"Settled backorder deficit using Batch #{new_batch.batch_number}",
            created_by=user_id,
        ))

        # Reconcile historical oversold ledger snapshots with the true acquisition cost
        await db.execute(
            update(StockLedger)
            .where(
                StockLedger.intake_id == def_b.id,
                StockLedger.change_type == StockChangeTypeEnum.OVERSOLD,
            )
            .values(unit_cost_snapshot=new_batch.unit_cost)
        )

    return total_absorbed


async def log_stock_intake(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    user_id: uuid.UUID | None,
    data: StockIntakeCreate,
) -> StockIntake:
    """
    Log a daily stock arrival:
    1. Creates StockIntake record with unique batch number & batch prices
    2. Increments InventoryItem.current_stock
    3. Retains/updates item margins
    4. Syncs price from oldest positive batch (does not overwrite if older batch exists)
    5. Appends StockLedger entry (change_type="intake")
    """
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    batch_num = data.batch_number.strip() if data.batch_number else generate_batch_number()

    supplier_id = data.supplier_id
    if not supplier_id and data.supplier_name and data.supplier_name.strip():
        name_strip = data.supplier_name.strip()
        sup_res = await db.execute(
            select(Supplier).where(
                Supplier.outlet_id == outlet_id,
                Supplier.name.ilike(name_strip),
            )
        )
        sup = sup_res.scalars().first()
        if not sup:
            sup = Supplier(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                name=name_strip,
            )
            db.add(sup)
            await db.flush()
        supplier_id = sup.id

    # Update item margin config if provided in the intake request
    if data.margin_type is not None:
        item.margin_type = data.margin_type
    if data.retail_margin_pct is not None:
        item.retail_margin_pct = data.retail_margin_pct
    if data.mrp_margin_pct is not None:
        item.mrp_margin_pct = data.mrp_margin_pct
    if data.wholesale_margin_pct is not None:
        item.wholesale_margin_pct = data.wholesale_margin_pct

    # Calculate batch-level prices based on batch unit_cost and margins
    def calc_batch_price(margin_pct: Decimal | None) -> Decimal | None:
        cost = data.unit_cost
        if margin_pct is None or cost == Decimal("0.00"):
            return None
        m_type = data.margin_type or item.margin_type
        if m_type == MarginTypeEnum.MARKUP:
            return (cost + (cost * margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
        elif m_type == MarginTypeEnum.MARGIN:
            if margin_pct >= Decimal("100"):
                return None
            return (cost / (Decimal("1") - margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
        return None

    batch_retail = data.retail_price if getattr(data, "retail_price", None) is not None else calc_batch_price(data.retail_margin_pct or item.retail_margin_pct)
    batch_mrp = data.mrp if getattr(data, "mrp", None) is not None else calc_batch_price(data.mrp_margin_pct or item.mrp_margin_pct)
    batch_wholesale = data.wholesale_price if getattr(data, "wholesale_price", None) is not None else calc_batch_price(data.wholesale_margin_pct or item.wholesale_margin_pct)

    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number=batch_num,
        quantity=data.quantity,
        initial_quantity=data.quantity,
        remaining_quantity=data.quantity,
        unit_cost=data.unit_cost,
        retail_price=batch_retail,
        mrp=batch_mrp,
        wholesale_price=batch_wholesale,
        supplier_id=supplier_id,
        intake_date=ensure_naive_utc(data.intake_date) or utc_now(),
        expiry_date=ensure_naive_utc(data.expiry_date),
        added_by=user_id,
        notes=data.notes.strip() if data.notes else None,
    )
    db.add(intake)

    # Increment stock
    item.current_stock = item.current_stock + data.quantity

    ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        intake_id=intake.id,
        batch_balance=intake.remaining_quantity,
        change_type=StockChangeTypeEnum.INTAKE,
        quantity_change=data.quantity,
        resulting_stock=item.current_stock,
        created_by=user_id,
        unit_cost_snapshot=data.unit_cost,
    )
    db.add(ledger)

    # Absorb any open oversold deficit batches into this new intake batch
    await absorb_deficit_into_new_batch(db, outlet_id, item, intake, user_id)

    # Also retroactively update unit_cost_snapshot for unbatched AUTO_DEDUCTION ledger entries
    stmt = (
        update(StockLedger)
        .where(
            StockLedger.item_id == item.id,
            StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
            StockLedger.intake_id.is_(None),
        )
        .values(intake_id=intake.id, unit_cost_snapshot=data.unit_cost)
    )
    await db.execute(stmt)

    await db.flush()

    # Check outlet's latest_batch_price_override setting
    from app.models.outlet import Outlet
    outlet = await db.get(Outlet, outlet_id)
    if outlet and outlet.latest_batch_price_override:
        await propagate_latest_batch_prices_to_all_batches(db, item.id, outlet_id, intake)
    else:
        # Sync price from oldest positive batch (legacy behavior)
        await sync_item_prices_from_oldest_batch(db, item.id, outlet_id)

    await db.flush()
    await db.refresh(intake)
    return intake


async def quick_scan_increment(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    user_id: uuid.UUID | None,
    barcode: str,
    quantity: Decimal = Decimal("1.000"),
    batch_number: str | None = None,
    expiry_date: datetime | None = None,
    unit_cost: Decimal | None = None,
) -> tuple[InventoryItem, StockIntake]:
    """
    Subsequent scan: Auto-increments item count for recognized barcode.
    Creates a new batch record and ledger entry.
    """
    clean_barcode = barcode.strip()
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.outlet_id == outlet_id,
            InventoryItem.barcode == clean_barcode,
            InventoryItem.is_active == True,  # noqa: E712
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No item registered with barcode '{clean_barcode}'",
        )

    effective_cost = unit_cost if unit_cost is not None else item.cost_per_unit
    batch_num = batch_number or f"SCAN-{uuid.uuid4().hex[:6].upper()}"

    def calc_quick_price(margin_pct: Decimal | None) -> Decimal | None:
        cost = effective_cost
        if margin_pct is None or cost == Decimal("0.00"):
            return None
        if item.margin_type == MarginTypeEnum.MARKUP:
            return (cost + (cost * margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
        elif item.margin_type == MarginTypeEnum.MARGIN:
            if margin_pct >= Decimal("100"):
                return None
            return (cost / (Decimal("1") - margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
        return None

    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number=batch_num,
        quantity=quantity,
        remaining_quantity=quantity,
        unit_cost=effective_cost,
        retail_price=calc_quick_price(item.retail_margin_pct) or item.retail_price,
        mrp=calc_quick_price(item.mrp_margin_pct) or item.mrp,
        wholesale_price=calc_quick_price(item.wholesale_margin_pct) or item.wholesale_price,
        intake_date=utc_now(),
        expiry_date=ensure_naive_utc(expiry_date),
        added_by=user_id,
        notes="Quick barcode scan inward",
    )
    db.add(intake)

    item.current_stock = item.current_stock + quantity
    await db.flush()
    # Check outlet's latest_batch_price_override setting
    from app.models.outlet import Outlet
    outlet = await db.get(Outlet, outlet_id)
    if outlet and outlet.latest_batch_price_override:
        await propagate_latest_batch_prices_to_all_batches(db, item.id, outlet_id, intake)
    else:
        await sync_item_prices_from_oldest_batch(db, item.id, outlet_id)

    ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        intake_id=intake.id,
        batch_balance=intake.remaining_quantity,
        change_type=StockChangeTypeEnum.INTAKE,
        quantity_change=quantity,
        resulting_stock=item.current_stock,
        created_by=user_id,
    )
    db.add(ledger)

    # Absorb any open oversold deficit batches into this new intake batch
    await absorb_deficit_into_new_batch(db, outlet_id, item, intake, user_id)

    await db.flush()
    await db.refresh(item)
    await db.refresh(intake)
    return item, intake


async def onboard_scanned_item(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    user_id: uuid.UUID | None,
    barcode: str,
    name: str,
    category: str = "General",
    unit: InventoryUnitEnum = InventoryUnitEnum.PCS,
    initial_stock: Decimal = Decimal("0.000"),
    cost_per_unit: Decimal = Decimal("0.00"),
    selling_price: Decimal | None = None,
    reorder_threshold: Decimal = Decimal("5.000"),
    batch_number: str | None = None,
    expiry_date: datetime | None = None,
    supplier_id: uuid.UUID | None = None,
    mrp: Decimal | None = None,
    tax_category: str | None = "GST 0%",
    tax_rate: Decimal | None = Decimal("0.00"),
    sorted_quantity: Decimal | None = None,
    total_billed_amount: Decimal | None = None,
    item_id: uuid.UUID | None = None,
    wholesale_price: Decimal | None = None,
    shelf_life_alert_hrs: int | None = None,
    margin_type: MarginTypeEnum = MarginTypeEnum.MARKUP,
    retail_margin_pct: Decimal | None = None,
    mrp_margin_pct: Decimal | None = None,
    wholesale_margin_pct: Decimal | None = None,
    alternate_units: list[dict[str, Any]] | None = None,
    hsn_code: str | None = None,
) -> tuple[InventoryItem, StockIntake | None]:
    """
    Scan / Manual Inward Stock: Registers a new item or appends a new batch to an existing item.
    Also creates or updates corresponding MenuItem if selling_price is provided.
    """
    clean_barcode = barcode.strip() if barcode and barcode.strip() else None

    # Determine net usable stock (Sorted Qty takes priority over Initial Qty)
    effective_stock = sorted_quantity if (sorted_quantity is not None and sorted_quantity > Decimal("0.000")) else initial_stock

    # Compute unit cost based on total billed amount if provided
    if total_billed_amount is not None and total_billed_amount > Decimal("0.00") and effective_stock > Decimal("0.000"):
        computed_unit_cost = (total_billed_amount / effective_stock).quantize(Decimal("0.01"))
    else:
        computed_unit_cost = cost_per_unit

    # Check if target item already exists by item_id, barcode, or name
    item: InventoryItem | None = None
    if item_id:
        res = await db.execute(
            select(InventoryItem).where(
                InventoryItem.outlet_id == outlet_id,
                InventoryItem.id == item_id,
                InventoryItem.is_active == True,  # noqa: E712
            )
        )
        item = res.scalar_one_or_none()

    if not item:
        # Check by name (case-insensitive) for outlet
        res_name = await db.execute(
            select(InventoryItem).where(
                InventoryItem.outlet_id == outlet_id,
                InventoryItem.name.ilike(name.strip()),
                InventoryItem.is_active == True,  # noqa: E712
            )
        )
        item = res_name.scalar_one_or_none()

    if item:
        # Item exists -> Update existing item stock, cost_per_unit, mrp, wholesale_price, tax, etc.
        item.current_stock = item.current_stock + effective_stock
        if computed_unit_cost > Decimal("0.00"):
            item.cost_per_unit = computed_unit_cost
        if mrp is not None and mrp > Decimal("0.00"):
            item.mrp = mrp
        if wholesale_price is not None:
            item.wholesale_price = wholesale_price
        if selling_price is not None:
            item.retail_price = selling_price
        
        item.margin_type = margin_type
        if retail_margin_pct is not None:
            item.retail_margin_pct = retail_margin_pct
        if mrp_margin_pct is not None:
            item.mrp_margin_pct = mrp_margin_pct
        if wholesale_margin_pct is not None:
            item.wholesale_margin_pct = wholesale_margin_pct

        if tax_category:
            item.tax_category = tax_category
        if tax_rate is not None:
            item.tax_rate = tax_rate
        if clean_barcode and item.barcode != clean_barcode:
            existing_bc = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.outlet_id == outlet_id,
                    InventoryItem.barcode == clean_barcode,
                    InventoryItem.id != item.id,
                    InventoryItem.is_active == True,  # noqa: E712
                )
            )
            if existing_bc.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Barcode '{clean_barcode}' is already assigned to another inventory item",
                )
            item.barcode = clean_barcode

            # Synchronize any existing linked MenuItems to the new barcode
            from app.models.menu_item import MenuItem
            mi_linked_res = await db.execute(
                select(MenuItem).where(
                    MenuItem.outlet_id == outlet_id,
                    MenuItem.inventory_item_id == item.id,
                )
            )
            for mi in mi_linked_res.scalars().all():
                mi.barcode = clean_barcode
            item.alternate_units = alternate_units
        if hsn_code is not None:
            item.hsn_code = hsn_code.strip() if hsn_code else None
    else:
        # Item does not exist -> Create new InventoryItem
        if clean_barcode:
            existing = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.outlet_id == outlet_id,
                    InventoryItem.barcode == clean_barcode,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Barcode '{clean_barcode}' is already assigned to another inventory item",
                )

        item = InventoryItem(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            name=name.strip(),
            barcode=clean_barcode,
            unit=unit,
            category=category.strip(),
            current_stock=effective_stock,
            reorder_threshold=reorder_threshold,
            cost_per_unit=computed_unit_cost,
            mrp=mrp,
            wholesale_price=wholesale_price,
            retail_price=selling_price,
            margin_type=margin_type,
            retail_margin_pct=retail_margin_pct,
            mrp_margin_pct=mrp_margin_pct,
            wholesale_margin_pct=wholesale_margin_pct,
            tax_category=tax_category,
            tax_rate=tax_rate,
            shelf_life_alert_hrs=shelf_life_alert_hrs,
            alternate_units=alternate_units or [],
            hsn_code=hsn_code.strip() if hsn_code else None,
            is_active=True,
        )
        db.add(item)
        await db.flush()

    intake = None
    if effective_stock > Decimal("0.000"):
        batch_num = batch_number.strip() if batch_number else generate_batch_number()
        intake = StockIntake(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            batch_number=batch_num,
            quantity=effective_stock,
            initial_quantity=initial_stock,
            remaining_quantity=effective_stock,
            unit_cost=computed_unit_cost,
            retail_price=selling_price,
            mrp=mrp,
            wholesale_price=wholesale_price,
            supplier_id=supplier_id,
            intake_date=utc_now(),
            expiry_date=ensure_naive_utc(expiry_date),
            added_by=user_id,
            notes="Initial barcode onboarding batch",
        )
        db.add(intake)

        ledger = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=intake.id,
            batch_balance=intake.remaining_quantity,
            change_type=StockChangeTypeEnum.INTAKE,
            quantity_change=effective_stock,
            resulting_stock=item.current_stock,
            created_by=user_id,
        )
        db.add(ledger)

        # Absorb any open oversold deficit batches into this new intake batch
        await absorb_deficit_into_new_batch(db, outlet_id, item, intake, user_id)

    # 2. Optionally create/link MenuItem for POS billing
    if selling_price is not None:
        from app.models.category import Category
        from app.models.menu_item import MenuItem

        # Look up or create category
        cat_res = await db.execute(
            select(Category).where(
                Category.outlet_id == outlet_id,
                Category.name.ilike(category.strip()),
            )
        )
        cat_row = cat_res.scalars().first()
        if not cat_row:
            cat_row = Category(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                name=category.strip(),
                display_order=0,
            )
            db.add(cat_row)
            await db.flush()

        # Check if MenuItem already exists for this inventory item
        mi_stmt = select(MenuItem).where(
            MenuItem.outlet_id == outlet_id,
            MenuItem.inventory_item_id == item.id,
        )
        mi_res = await db.execute(mi_stmt)
        menu_items = list(mi_res.scalars().all())

        # If not linked by inventory_item_id, check by barcode or item name
        if not menu_items:
            if clean_barcode:
                mi_bc_res = await db.execute(
                    select(MenuItem).where(
                        MenuItem.outlet_id == outlet_id,
                        MenuItem.barcode == clean_barcode,
                    )
                )
                menu_items = list(mi_bc_res.scalars().all())
            if not menu_items:
                mi_name_res = await db.execute(
                    select(MenuItem).where(
                        MenuItem.outlet_id == outlet_id,
                        MenuItem.name.ilike(name.strip()),
                    )
                )
                menu_items = list(mi_name_res.scalars().all())

            # Link them to this inventory item if unlinked
            for mi in menu_items:
                if not mi.inventory_item_id:
                    mi.inventory_item_id = item.id

        unit_str = unit.value.lower() if hasattr(unit, "value") else str(unit).lower()

        if menu_items:
            # Find the primary matching MenuItem (prefer exact barcode match, then exact name match, then first)
            primary_mi = None
            if clean_barcode:
                for mi in menu_items:
                    if mi.barcode and mi.barcode.strip() == clean_barcode.strip():
                        primary_mi = mi
                        break
            if not primary_mi:
                for mi in menu_items:
                    if mi.name and mi.name.strip().lower() == name.strip().lower():
                        primary_mi = mi
                        break
            if not primary_mi:
                primary_mi = menu_items[0]

            # Update all linked menu items with updated pricing & category so POS catalog is synchronized
            for mi in menu_items:
                mi.category_id = cat_row.id
                mi.price = selling_price
                mi.mrp = mrp
                mi.wholesale_price = wholesale_price
                mi.tax_category = tax_category
                mi.tax_rate = tax_rate
                mi.unit_label = unit_str
                if alternate_units is not None:
                    mi.alternate_units = alternate_units

            # Update primary matching item with name, barcode, and HSN
            primary_mi.name = name.strip()
            if clean_barcode:
                primary_mi.barcode = clean_barcode
            if hsn_code is not None:
                primary_mi.hsn_code = hsn_code.strip() if hsn_code else None
        else:
            menu_item = MenuItem(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                category_id=cat_row.id,
                inventory_item_id=item.id,
                name=name.strip(),
                barcode=clean_barcode,
                price=selling_price,
                mrp=mrp,
                wholesale_price=wholesale_price,
                tax_category=tax_category,
                tax_rate=tax_rate,
                hsn_code=hsn_code.strip() if hsn_code else None,
                is_available=True,
                is_verification_required=False,
                unit_label=unit_str,
                alternate_units=alternate_units or item.alternate_units or [],
            )
            db.add(menu_item)

    await db.flush()
    await sync_item_prices_from_oldest_batch(db, item.id, outlet_id)

    from app.services.menu_service import invalidate_outlet_menu
    await invalidate_outlet_menu(db, outlet_id)

    if selling_price is not None:
        try:
            from app.services.websocket_service import broadcast_catalog_updated
            await broadcast_catalog_updated(outlet_id, reason="INVENTORY_ONBOARDED", item_id=str(item.id))
        except Exception as e:
            logger.warning(f"Failed to broadcast catalog update: {e}")

    await db.flush()
    await db.refresh(item)
    if intake:
        await db.refresh(intake)
    return item, intake


async def get_all_batches(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_id: uuid.UUID | None = None,
    search: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    """
    Get list of all intake batches for an outlet with FEFO / expiry status.
    Optionally filter by item_id or search query.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stmt = (
        select(StockIntake)
        .options(
            selectinload(StockIntake.item),
            selectinload(StockIntake.supplier)
        )
        .where(StockIntake.outlet_id == outlet_id)
    )
    if item_id:
        await reconcile_item_stock_from_batches(db, item_id)
        stmt = stmt.where(StockIntake.item_id == item_id)
    if search and search.strip():
        s = f"%{search.strip()}%"
        stmt = stmt.outerjoin(InventoryItem, StockIntake.item_id == InventoryItem.id).where(
            or_(
                StockIntake.batch_number.ilike(s),
                InventoryItem.name.ilike(s),
                InventoryItem.barcode.ilike(s),
            )
        )
    stmt = stmt.order_by(StockIntake.intake_date.desc())

    total = 0
    if page is not None and page_size is not None:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    res = await db.execute(stmt)
    batches = res.scalars().all()

    result = []
    for b in batches:
        is_ov = bool(b.batch_number and "-OV-" in b.batch_number)
        if b.remaining_quantity < Decimal("0.000"):
            status_str = "OVERSOLD"
        elif b.remaining_quantity == Decimal("0.000"):
            status_str = "SETTLED" if is_ov else "DEPLETED"
        elif b.expiry_date and b.expiry_date < now:
            status_str = "EXPIRED"
        elif b.expiry_date and b.expiry_date <= now + timedelta(days=7):
            status_str = "EXPIRING_SOON"
        else:
            status_str = "ACTIVE"

        init_q = float(b.initial_quantity) if (b.initial_quantity is not None and float(b.initial_quantity) > 0) else float(b.quantity)
        usable_q = float(b.quantity)
        u_cost = float(b.unit_cost)
        total_billed = u_cost * usable_q
        purchase_cost = round(total_billed / init_q, 2) if init_q > 0 else u_cost

        result.append({
            "id": b.id,
            "outlet_id": b.outlet_id,
            "item_id": b.item_id,
            "item_name": b.item.name if b.item else "Unknown Item",
            "item_barcode": b.item.barcode if b.item else None,
            "unit": b.item.unit if b.item else InventoryUnitEnum.PCS,
            "batch_number": b.batch_number or f"BAT-{b.id.hex[:6]}",
            "quantity": b.quantity,
            "initial_quantity": b.initial_quantity if b.initial_quantity is not None else b.quantity,
            "remaining_quantity": b.remaining_quantity,
            "unit_cost": b.unit_cost,
            "purchase_unit_cost": purchase_cost,
            "retail_price": b.retail_price,
            "mrp": b.mrp,
            "wholesale_price": b.wholesale_price,
            "supplier_id": b.supplier_id,
            "supplier_name": b.supplier.name if b.supplier else None,
            "intake_date": b.intake_date.replace(tzinfo=timezone.utc) if b.intake_date else None,
            "expiry_date": b.expiry_date.replace(tzinfo=timezone.utc) if b.expiry_date else None,
            "shelf_life_alert_hrs": b.item.shelf_life_alert_hrs if b.item else None,
            "status": status_str,
            "notes": b.notes,
            "item_cost_per_unit": b.item.cost_per_unit if b.item else None,
            "item_retail_price": b.item.retail_price if b.item else None,
            "item_mrp": b.item.mrp if b.item else None,
            "margin_type": b.item.margin_type if b.item else None,
            "retail_margin_pct": b.item.retail_margin_pct if b.item else None,
            "mrp_margin_pct": b.item.mrp_margin_pct if b.item else None,
        })

    if page is not None and page_size is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    return result


async def save_menu_item_recipe(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: RecipeSaveRequest,
) -> list[MenuItemRecipe]:
    """Save/update the ingredient recipe mapping for a menu item."""
    # Delete existing recipe rows for this menu item
    existing_res = await db.execute(
        select(MenuItemRecipe).where(
            MenuItemRecipe.menu_item_id == data.menu_item_id
        )
    )
    for old_row in existing_res.scalars().all():
        await db.delete(old_row)

    new_recipes: list[MenuItemRecipe] = []
    for ing in data.ingredients:
        recipe_row = MenuItemRecipe(
            id=uuid.uuid4(),
            menu_item_id=data.menu_item_id,
            inventory_item_id=ing.inventory_item_id,
            quantity_required=ing.quantity_required,
            unit=ing.unit,
        )
        db.add(recipe_row)
        new_recipes.append(recipe_row)

    await db.flush()
    return new_recipes


async def get_near_expiry_alerts(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    threshold_days: int | None = None,
) -> list[dict[str, Any]]:
    """
    Find active intake batches (remaining_quantity > 0) with expiry_date <= NOW() + threshold_days.
    Uses outlet's near_expiry_threshold_days setting if threshold_days is not provided.
    """
    if threshold_days is None:
        outlet = await db.get(Outlet, outlet_id)
        threshold_days = outlet.near_expiry_threshold_days if outlet else 7

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff_date = now + timedelta(days=threshold_days)

    res = await db.execute(
        select(StockIntake)
        .options(selectinload(StockIntake.item))
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > Decimal("0.000"),
            StockIntake.expiry_date.is_not(None),
            StockIntake.expiry_date <= cutoff_date,
        )
        .order_by(StockIntake.expiry_date.asc())
    )
    batches = res.scalars().all()

    alerts = []
    for batch in batches:
        if not batch.expiry_date:
            continue
        days_left = (batch.expiry_date.date() - now.date()).days
        status_str = "EXPIRED" if days_left < 0 else "EXPIRING_SOON"
        alerts.append({
            "intake_id": batch.id,
            "item_id": batch.item_id,
            "item_name": batch.item.name if batch.item else "Unknown Item",
            "unit": batch.item.unit if batch.item else InventoryUnitEnum.PCS,
            "remaining_quantity": batch.remaining_quantity,
            "expiry_date": batch.expiry_date,
            "days_until_expiry": days_left,
            "status": status_str,
        })
    return alerts


async def log_stock_wastage(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: StockWastageRequest,
    user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """
    Log stock loss/spoilage/breakage/theft as MANUAL_ADJUSTMENT in ledger,
    decrement current_stock, and draw down batch lot if applicable.
    """
    res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    waste_qty = data.quantity
    unit_val = item.unit.value if hasattr(item.unit, "value") else str(item.unit or "units")

    # Determine maximum stock available to write off
    max_available = item.current_stock

    # Draw down batch if specified or FEFO
    target_batch = None
    if data.batch_number:
        b_res = await db.execute(
            select(StockIntake).where(
                StockIntake.item_id == item.id,
                StockIntake.outlet_id == outlet_id,
                StockIntake.batch_number == data.batch_number.strip(),
            )
        )
        target_batch = b_res.scalar_one_or_none()
        if not target_batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Batch lot '{data.batch_number}' not found for item '{item.name}'."
            )
        max_available = target_batch.remaining_quantity

    if max_available <= Decimal("0.000"):
        source_label = f"batch #{target_batch.batch_number}" if target_batch else f"'{item.name}'"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot log wastage: {source_label} has 0 available stock.",
        )

    if waste_qty > max_available:
        source_label = f"available stock in batch #{target_batch.batch_number}" if target_batch else "total available stock"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Wastage quantity ({waste_qty}) exceeds {source_label} ({max_available} {unit_val}).",
        )

    if target_batch:
        target_batch.remaining_quantity = max(Decimal("0.000"), target_batch.remaining_quantity - waste_qty)
    else:
        # Draw down active batches by FEFO (earliest expiry first)
        batches_res = await db.execute(
            select(StockIntake)
            .where(
                StockIntake.item_id == item.id,
                StockIntake.outlet_id == outlet_id,
                StockIntake.remaining_quantity > Decimal("0.000"),
            )
            .order_by(StockIntake.expiry_date.asc().nulls_last(), StockIntake.intake_date.asc())
        )
        active_batches = batches_res.scalars().all()
        rem_to_deduct = waste_qty
        for b in active_batches:
            if rem_to_deduct <= Decimal("0.000"):
                break
            deduct_from_batch = min(b.remaining_quantity, rem_to_deduct)
            b.remaining_quantity -= deduct_from_batch
            rem_to_deduct -= deduct_from_batch

    unit_cost = target_batch.unit_cost if (target_batch and target_batch.unit_cost is not None) else (item.cost_per_unit or Decimal("0.00"))
    loss_amount = waste_qty * unit_cost
    reason_label = data.reason.replace("_", " ").title()

    # Update item current stock
    item.current_stock = max(Decimal("0.000"), item.current_stock - waste_qty)

    ledger_entry = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.MANUAL_ADJUSTMENT,
        quantity_change=-waste_qty,
        resulting_stock=item.current_stock,
        reference_order_id=None,
        intake_id=target_batch.id if target_batch else None,
        batch_balance=target_batch.remaining_quantity if target_batch else None,
        created_by=user_id,
        unit_cost_snapshot=unit_cost,
        reason=data.reason,
        notes=data.notes,
    )
    db.add(ledger_entry)
    await db.flush()

    # Reconcile from remaining batches to ensure perfect synchronization
    await reconcile_item_stock_from_batches(db, item.id)
    await db.refresh(item)

    unit_val = item.unit.value if hasattr(item.unit, "value") else str(item.unit)
    batch_msg = f" from batch #{target_batch.batch_number}" if target_batch else ""
    return {
        "success": True,
        "message": f"Wrote off {waste_qty} {unit_val} of '{item.name}'{batch_msg} ({reason_label})",
        "item_id": item.id,
        "item_name": item.name,
        "quantity_wasted": waste_qty,
        "new_current_stock": item.current_stock,
        "estimated_loss_amount": loss_amount,
        "ledger_entry_id": ledger_entry.id,
    }


async def create_supplier(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: Any,
):
    """Create a new vendor/supplier record for an outlet."""
    from app.models.supplier import Supplier

    name_clean = data.name.strip()
    # Check if supplier with same name exists
    stmt = select(Supplier).where(
        Supplier.outlet_id == outlet_id,
        Supplier.name.ilike(name_clean),
        Supplier.is_active == True,  # noqa: E712
    )
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        return existing

    supplier = Supplier(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=name_clean,
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip() if data.email else None,
        address=data.address.strip() if data.address else None,
        gstin=data.gstin.strip() if data.gstin else None,
        contact_person=data.contact_person.strip() if data.contact_person else None,
        payment_terms=data.payment_terms.strip() if data.payment_terms else None,
        notes=data.notes.strip() if data.notes else None,
        is_active=True,
    )
    db.add(supplier)
    await db.flush()
    await db.refresh(supplier)
    return supplier


async def update_supplier(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    supplier_id: uuid.UUID,
    data: Any,
):
    """Update an existing vendor/supplier record."""
    from app.models.supplier import Supplier

    stmt = select(Supplier).where(
        Supplier.id == supplier_id,
        Supplier.outlet_id == outlet_id,
    )
    res = await db.execute(stmt)
    supplier = res.scalar_one_or_none()
    if not supplier:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(supplier, field, value)

    await db.flush()
    await db.refresh(supplier)
    return supplier


async def list_suppliers(
    db: AsyncSession,
    outlet_id: uuid.UUID,
):
    """List all active suppliers for an outlet."""
    from app.models.supplier import Supplier

    stmt = (
        select(Supplier)
        .where(
            Supplier.outlet_id == outlet_id,
            Supplier.is_active == True,  # noqa: E712
        )
        .order_by(Supplier.name)
    )
    res = await db.execute(stmt)
    return res.scalars().all()


async def update_batch_metadata(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    intake_id: uuid.UUID,
    data: BatchUpdateMetadataRequest,
) -> dict:
    """
    Update batch metadata and pricing:
    - batch_number: Correct typos or manual lot codes.
    - expiry_date: Add, update, or clear expiration date.
    - intake_date: Backdate/correct true physical arrival timestamp.
    - supplier_id: Assign or change vendor.
    - notes: Lot remarks, storage bin/rack, temperature.
    - shelf_life_alert_hrs: Update shelf life alert hours on parent item.
    - mrp, retail_price, wholesale_price: Update batch-specific price points.
    - alternate_units: Configure/update secondary units on parent item if omitted at creation.
    - sync_catalog_price: Sync new prices to parent Item Master & linked MenuItems for POS checkout.

    Maintains total stock level stability, ledger integrity, and strictly anchors
    shelf-life and FEFO calculations to the physical arrival timestamp (intake_date).
    """
    stmt = (
        select(StockIntake)
        .options(selectinload(StockIntake.item), selectinload(StockIntake.supplier))
        .where(
            StockIntake.id == intake_id,
            StockIntake.outlet_id == outlet_id,
        )
    )
    res = await db.execute(stmt)
    batch = res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Stock intake batch not found")

    fields_set = data.model_dump(exclude_unset=True)

    if "batch_number" in fields_set:
        if data.batch_number and data.batch_number.strip():
            batch.batch_number = data.batch_number.strip()

    if "expiry_date" in fields_set:
        batch.expiry_date = ensure_naive_utc(data.expiry_date)

    if "intake_date" in fields_set:
        intake_dt = ensure_naive_utc(data.intake_date)
        if intake_dt is not None:
            batch.intake_date = intake_dt

    if "supplier_id" in fields_set:
        batch.supplier_id = data.supplier_id

    if "notes" in fields_set:
        batch.notes = data.notes.strip() if data.notes else None

    if "shelf_life_alert_hrs" in fields_set and batch.item:
        batch.item.shelf_life_alert_hrs = data.shelf_life_alert_hrs

    # Batch-level pricing updates
    price_updated = False
    if "mrp" in fields_set:
        batch.mrp = data.mrp
        price_updated = True
    if "retail_price" in fields_set:
        batch.retail_price = data.retail_price
        price_updated = True
    if "wholesale_price" in fields_set:
        batch.wholesale_price = data.wholesale_price
        price_updated = True

    # Alternate units configuration on parent item
    if "alternate_units" in fields_set and batch.item:
        batch.item.alternate_units = data.alternate_units or []
        from app.models.menu_item import MenuItem
        mi_res = await db.execute(
            select(MenuItem).where(
                MenuItem.outlet_id == outlet_id,
                MenuItem.inventory_item_id == batch.item_id,
            )
        )
        for mi in mi_res.scalars().all():
            mi.alternate_units = data.alternate_units or []
        from app.services.menu_service import invalidate_outlet_menu
        await invalidate_outlet_menu(db, outlet_id)

    # Sync pricing to product catalog / POS checkout if requested
    if getattr(data, "sync_catalog_price", False) and batch.item and price_updated:
        if "retail_price" in fields_set and data.retail_price is not None:
            batch.item.retail_price = data.retail_price
        if "mrp" in fields_set and data.mrp is not None:
            batch.item.mrp = data.mrp
        if "wholesale_price" in fields_set and data.wholesale_price is not None:
            batch.item.wholesale_price = data.wholesale_price

        from app.models.menu_item import MenuItem
        mi_res = await db.execute(
            select(MenuItem).where(
                MenuItem.outlet_id == outlet_id,
                MenuItem.inventory_item_id == batch.item_id,
            )
        )
        for mi in mi_res.scalars().all():
            if "retail_price" in fields_set and data.retail_price is not None:
                mi.price = data.retail_price
            if "mrp" in fields_set and data.mrp is not None:
                mi.mrp = data.mrp
            if "wholesale_price" in fields_set and data.wholesale_price is not None:
                mi.wholesale_price = data.wholesale_price

        from app.services.menu_service import invalidate_outlet_menu
        await invalidate_outlet_menu(db, outlet_id)
        try:
            from app.services.websocket_service import broadcast_catalog_updated
            await broadcast_catalog_updated(outlet_id, reason="BATCH_PRICE_UPDATED", item_id=str(batch.item_id))
        except Exception:
            pass
    elif price_updated:
        await sync_item_prices_from_oldest_batch(db, batch.item_id, outlet_id)

    await db.commit()

    # Reload batch with eagerly loaded relationships
    reload_stmt = (
        select(StockIntake)
        .options(selectinload(StockIntake.item), selectinload(StockIntake.supplier))
        .where(StockIntake.id == intake_id)
    )
    res_reloaded = await db.execute(reload_stmt)
    batch = res_reloaded.scalar_one()

    # Re-evaluate status
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    is_ov = bool(batch.batch_number and "-OV-" in batch.batch_number)
    if batch.remaining_quantity < Decimal("0.000"):
        status_str = "OVERSOLD"
    elif batch.remaining_quantity == Decimal("0.000"):
        status_str = "SETTLED" if is_ov else "DEPLETED"
    elif batch.expiry_date and batch.expiry_date < now:
        status_str = "EXPIRED"
    elif batch.expiry_date and batch.expiry_date <= now + timedelta(days=7):
        status_str = "EXPIRING_SOON"
    else:
        status_str = "ACTIVE"

    init_q = float(batch.initial_quantity) if (batch.initial_quantity is not None and float(batch.initial_quantity) > 0) else float(batch.quantity)
    usable_q = float(batch.quantity)
    u_cost = float(batch.unit_cost)
    total_billed = u_cost * usable_q
    purchase_cost = round(total_billed / init_q, 2) if init_q > 0 else u_cost

    return {
        "status": "success",
        "message": "Batch metadata updated successfully",
        "batch": {
            "id": batch.id,
            "outlet_id": batch.outlet_id,
            "item_id": batch.item_id,
            "item_name": batch.item.name if batch.item else "Unknown Item",
            "item_barcode": batch.item.barcode if batch.item else None,
            "unit": batch.item.unit if batch.item else "piece",
            "batch_number": batch.batch_number or f"BAT-{batch.id.hex[:6]}",
            "quantity": batch.quantity,
            "initial_quantity": batch.initial_quantity if batch.initial_quantity is not None else batch.quantity,
            "remaining_quantity": batch.remaining_quantity,
            "unit_cost": batch.unit_cost,
            "purchase_unit_cost": purchase_cost,
            "supplier_id": batch.supplier_id,
            "supplier_name": batch.supplier.name if batch.supplier else None,
            "intake_date": batch.intake_date.replace(tzinfo=timezone.utc) if batch.intake_date else None,
            "expiry_date": batch.expiry_date.replace(tzinfo=timezone.utc) if batch.expiry_date else None,
            "shelf_life_alert_hrs": batch.item.shelf_life_alert_hrs if batch.item else None,
            "status": status_str,
            "notes": batch.notes,
            "item_cost_per_unit": batch.item.cost_per_unit if batch.item else None,
            "item_retail_price": batch.item.retail_price if batch.item else None,
            "item_mrp": batch.item.mrp if batch.item else None,
            "margin_type": batch.item.margin_type if batch.item else None,
            "retail_margin_pct": batch.item.retail_margin_pct if batch.item else None,
            "mrp_margin_pct": batch.item.mrp_margin_pct if batch.item else None,
        },
    }


async def adjust_batch_stock(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    intake_id: uuid.UUID,
    staff_user: Any,
    data: Any,
):
    """
    Adjust batch stock:
    - PURCHASE_RETURN: Deduct batch & item stock, record StockLedger, create PurchaseReturn bill entry.
    - MANUAL_ADJUSTMENT: Deduct/adjust batch & item stock, record StockLedger.
    - VOID_BATCH: Zero out batch remaining stock, deduct from item stock, record StockLedger.
    """
    from app.models.purchase_return import PurchaseReturn

    # Fetch target batch
    intake_res = await db.execute(
        select(StockIntake)
        .options(selectinload(StockIntake.supplier))
        .where(
            StockIntake.id == intake_id,
            StockIntake.outlet_id == outlet_id,
        )
    )
    batch = intake_res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Stock intake batch not found")

    # Fetch parent item
    item_res = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == batch.item_id,
            InventoryItem.outlet_id == outlet_id,
        )
    )
    item = item_res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Parent inventory item not found")

    adj_type = data.adjustment_type.upper()
    qty_change = Decimal(str(data.quantity))
    user_uuid = getattr(staff_user, "user_id", None) or getattr(staff_user, "id", None)

    if adj_type != "INTAKE_CORRECTION" and batch.remaining_quantity <= Decimal("0.000"):
        raise HTTPException(
            status_code=400,
            detail="Cannot adjust or return stock from a batch with 0 remaining stock."
        )

    if adj_type == "INTAKE_CORRECTION":
        # Inward stock correction, appending stock, and margin/pricing recalculation
        is_oversold_reconcile = (
            batch.remaining_quantity < Decimal("0.000")
            or batch.quantity < Decimal("0.000")
            or (batch.batch_number and "-OV-" in batch.batch_number)
        )

        if is_oversold_reconcile:
            # Reconciling an oversold deficit batch with actual incoming physical stock
            if getattr(data, "quantity_delta", None) is not None and Decimal(str(data.quantity_delta)) > Decimal("0.000"):
                inward_qty = Decimal(str(data.quantity_delta))
            elif getattr(data, "new_total_quantity", None) is not None and Decimal(str(data.new_total_quantity)) > Decimal("0.000"):
                inward_qty = Decimal(str(data.new_total_quantity))
            else:
                inward_qty = Decimal(str(data.quantity))

            if inward_qty <= Decimal("0.000"):
                raise HTTPException(
                    status_code=400,
                    detail="Total inward quantity must be greater than 0."
                )

            delta = inward_qty
            new_total_qty = inward_qty
            # Fulfill the past deficit with the incoming inward quantity
            new_remaining = batch.remaining_quantity + inward_qty

            batch.quantity = inward_qty
            batch.initial_quantity = inward_qty
            batch.remaining_quantity = new_remaining
            item.current_stock = item.current_stock + delta

            if getattr(data, "new_unit_cost", None) is not None:
                new_cost = Decimal(str(data.new_unit_cost))
                batch.unit_cost = new_cost
            elif getattr(data, "total_billed", None) is not None and inward_qty > Decimal("0.000"):
                new_cost = (Decimal(str(data.total_billed)) / inward_qty).quantize(Decimal("0.01"))
                batch.unit_cost = new_cost
            else:
                new_cost = batch.unit_cost
        else:
            if getattr(data, "quantity_delta", None) is not None:
                delta = Decimal(str(data.quantity_delta))
                new_total_qty = batch.quantity + delta
            elif getattr(data, "new_total_quantity", None) is not None:
                new_total_qty = Decimal(str(data.new_total_quantity))
                delta = new_total_qty - batch.quantity
            else:
                delta = Decimal(str(data.quantity))
                new_total_qty = batch.quantity + delta

            if new_total_qty <= Decimal("0.000"):
                raise HTTPException(
                    status_code=400,
                    detail="Total inward quantity must be greater than 0."
                )

            new_remaining = batch.remaining_quantity + delta
            if new_remaining < Decimal("0.000"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot reduce inward quantity by {abs(delta):.2f} {item.unit}. Only {batch.remaining_quantity:.2f} {item.unit} remaining in batch ({batch.quantity - batch.remaining_quantity:.2f} {item.unit} already sold or consumed)."
                )

            batch.quantity = new_total_qty
            batch.initial_quantity = new_total_qty
            batch.remaining_quantity = new_remaining
            item.current_stock = max(Decimal("0.000"), item.current_stock + delta)

            if getattr(data, "new_unit_cost", None) is not None:
                new_cost = Decimal(str(data.new_unit_cost))
                batch.unit_cost = new_cost
            elif getattr(data, "total_billed", None) is not None and new_total_qty > Decimal("0.000"):
                new_cost = (Decimal(str(data.total_billed)) / new_total_qty).quantize(Decimal("0.01"))
                batch.unit_cost = new_cost
            else:
                new_cost = batch.unit_cost

        def calc_price(margin_pct: Decimal | None) -> Decimal | None:
            if margin_pct is None or new_cost == Decimal("0.00"):
                return None
            if item.margin_type == MarginTypeEnum.MARKUP:
                return (new_cost + (new_cost * margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
            elif item.margin_type == MarginTypeEnum.MARGIN:
                if margin_pct >= Decimal("100"):
                    return None
                return (new_cost / (Decimal("1") - margin_pct / Decimal("100"))).quantize(Decimal("0.01"))
            return None

        # Direct price overrides take priority, else fallback to margin formula
        if getattr(data, "new_retail_price", None) is not None:
            batch.retail_price = Decimal(str(data.new_retail_price))
        else:
            calc_retail = calc_price(item.retail_margin_pct)
            if calc_retail is not None:
                batch.retail_price = calc_retail

        if getattr(data, "new_mrp", None) is not None:
            batch.mrp = Decimal(str(data.new_mrp))
        else:
            calc_mrp = calc_price(item.mrp_margin_pct)
            if calc_mrp is not None:
                batch.mrp = calc_mrp

        if getattr(data, "new_wholesale_price", None) is not None:
            batch.wholesale_price = Decimal(str(data.new_wholesale_price))
        else:
            calc_wholesale = calc_price(item.wholesale_margin_pct)
            if calc_wholesale is not None:
                batch.wholesale_price = calc_wholesale

        if getattr(data, "sync_catalog_price", True):
            item.cost_per_unit = new_cost
            if batch.retail_price is not None:
                item.retail_price = batch.retail_price
            if batch.mrp is not None:
                item.mrp = batch.mrp
            if batch.wholesale_price is not None:
                item.wholesale_price = batch.wholesale_price

            from app.models.menu_item import MenuItem
            menu_res = await db.execute(
                select(MenuItem).where(MenuItem.inventory_item_id == item.id)
            )
            for mi in menu_res.scalars().all():
                if batch.retail_price is not None:
                    mi.price = batch.retail_price
                if batch.mrp is not None:
                    mi.mrp = batch.mrp
                if batch.wholesale_price is not None:
                    mi.wholesale_price = batch.wholesale_price

            from app.services.menu_service import invalidate_outlet_menu
            await invalidate_outlet_menu(db, outlet_id)
            try:
                from app.services.websocket_service import broadcast_catalog_updated
                await broadcast_catalog_updated(outlet_id, reason="BATCH_PRICE_UPDATED", item_id=str(item.id))
            except Exception:
                pass

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=batch.id,
            batch_balance=batch.remaining_quantity,
            change_type=StockChangeTypeEnum.INTAKE if is_oversold_reconcile else StockChangeTypeEnum.MANUAL_ADJUSTMENT,
            quantity_change=delta,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=new_cost,
            reason="OVERSOLD_RECONCILE" if is_oversold_reconcile else "INTAKE_CORRECTION",
            notes=getattr(data, "notes", None) or ("Oversold batch fulfillment" if is_oversold_reconcile else "Inward batch quantity/cost edit"),
        )
        db.add(ledger_entry)
        await db.flush()

        return {
            "status": "success",
            "message": f"Inward batch corrected successfully. Qty adjusted by {delta:+.2f} {item.unit}.",
            "batch_id": batch.id,
            "return_id": None,
            "new_quantity": batch.quantity,
            "new_remaining_quantity": batch.remaining_quantity,
            "new_unit_cost": batch.unit_cost,
            "item_current_stock": item.current_stock,
            "item_retail_price": item.retail_price,
            "item_mrp": item.mrp,
        }

    elif adj_type == "VOID_BATCH":
        # Zero out remaining stock for this batch
        deduct_qty = batch.remaining_quantity
        batch.remaining_quantity = Decimal("0.000")
        item.current_stock = max(Decimal("0.000"), item.current_stock - deduct_qty)

        change_enum = StockChangeTypeEnum.VOID_BATCH
        ledger_change = -deduct_qty
        notes_text = f"Batch #{batch.batch_number or batch.id} VOIDED. {data.notes or ''}".strip()

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=batch.id,
            batch_balance=batch.remaining_quantity,
            change_type=change_enum,
            quantity_change=ledger_change,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=batch.unit_cost,
            reason="VOID_BATCH",
            notes=notes_text,
        )
        db.add(ledger_entry)
        await db.flush()
        return {"status": "success", "message": "Batch voided successfully", "batch_id": batch.id, "return_id": None}

    elif adj_type == "PURCHASE_RETURN":
        # Validate quantity <= remaining_quantity
        if qty_change > batch.remaining_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot return {qty_change} units; only {batch.remaining_quantity} units remaining in batch."
            )

        batch.remaining_quantity = batch.remaining_quantity - qty_change
        item.current_stock = max(Decimal("0.000"), item.current_stock - qty_change)

        # Generate Return Bill Number (e.g. PR-YYYYMMDD-XXXX)
        now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        rand_str = uuid.uuid4().hex[:4].upper()
        return_number = f"PR-{now_str}-{rand_str}"

        supplier_name = data.supplier_name or (batch.supplier.name if batch.supplier else "General Supplier")
        
        # Calculate Purchase/Billed Unit Cost
        init_q = float(batch.initial_quantity) if (batch.initial_quantity is not None and float(batch.initial_quantity) > 0) else float(batch.quantity)
        usable_q = float(batch.quantity)
        u_cost = float(batch.unit_cost)
        calc_purchase_cost = Decimal(str(round((u_cost * usable_q) / init_q, 2))) if init_q > 0 else Decimal(str(u_cost))

        if getattr(data, "return_rate", None) is not None:
            unit_cost = Decimal(str(data.return_rate))
        else:
            unit_cost = calc_purchase_cost

        total_refund = unit_cost * qty_change

        purchase_return = PurchaseReturn(
            id=uuid.uuid4(),
            return_number=return_number,
            outlet_id=outlet_id,
            intake_id=batch.id,
            item_id=item.id,
            supplier_name=supplier_name,
            batch_number=batch.batch_number,
            quantity=qty_change,
            unit_cost=unit_cost,
            total_refund_amount=total_refund,
            reason=data.reason,
            notes=data.notes,
            created_by=user_uuid,
        )
        db.add(purchase_return)

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=batch.id,
            batch_balance=batch.remaining_quantity,
            change_type=StockChangeTypeEnum.PURCHASE_RETURN,
            quantity_change=-qty_change,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=unit_cost,
            reason=data.reason,
            notes=data.notes,
        )
        db.add(ledger_entry)
        await db.flush()
        return {
            "status": "success",
            "message": "Purchase return processed and return bill generated",
            "batch_id": batch.id,
            "return_id": purchase_return.id,
            "return_number": purchase_return.return_number,
        }

    else:
        # MANUAL_ADJUSTMENT (Audit/Loss)
        if qty_change > batch.remaining_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot adjust {qty_change} units; only {batch.remaining_quantity} units remaining in batch."
            )

        batch.remaining_quantity = batch.remaining_quantity - qty_change
        item.current_stock = max(Decimal("0.000"), item.current_stock - qty_change)

        ledger_entry = StockLedger(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            item_id=item.id,
            intake_id=batch.id,
            batch_balance=batch.remaining_quantity,
            change_type=StockChangeTypeEnum.MANUAL_ADJUSTMENT,
            quantity_change=-qty_change,
            resulting_stock=item.current_stock,
            created_by=user_uuid,
            unit_cost_snapshot=batch.unit_cost,
            reason=data.reason,
            notes=data.notes,
        )
        db.add(ledger_entry)
        await db.flush()
        return {"status": "success", "message": "Manual adjustment completed", "batch_id": batch.id, "return_id": None}


async def list_purchase_returns(
    db: AsyncSession,
    outlet_id: uuid.UUID,
):
    """List all purchase returns / return bills for an outlet."""
    from app.models.purchase_return import PurchaseReturn
    from app.models.inventory_item import InventoryItem
    from app.models.user import User

    stmt = (
        select(PurchaseReturn, InventoryItem.name.label("item_name"), User.email.label("created_by_name"))
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(User, PurchaseReturn.created_by == User.id)
        .where(PurchaseReturn.outlet_id == outlet_id)
        .order_by(PurchaseReturn.created_at.desc())
    )
    res = await db.execute(stmt)
    results = []
    for row in res.all():
        pr, item_name, user_name = row[0], row[1], row[2]
        d = {
            "id": pr.id,
            "return_number": pr.return_number,
            "outlet_id": pr.outlet_id,
            "intake_id": pr.intake_id,
            "item_id": pr.item_id,
            "item_name": item_name,
            "supplier_name": pr.supplier_name,
            "batch_number": pr.batch_number,
            "quantity": pr.quantity,
            "unit_cost": pr.unit_cost,
            "total_refund_amount": pr.total_refund_amount,
            "reason": pr.reason,
            "notes": pr.notes,
            "created_by": pr.created_by,
            "created_by_name": user_name or "System Admin",
            "created_at": pr.created_at,
        }
        results.append(d)
    return results


async def get_purchase_return_by_id(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    return_id: uuid.UUID,
):
    """Get single purchase return bill by ID."""
    from app.models.purchase_return import PurchaseReturn
    from app.models.inventory_item import InventoryItem
    from app.models.user import User

    stmt = (
        select(PurchaseReturn, InventoryItem.name.label("item_name"), User.email.label("created_by_name"))
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(User, PurchaseReturn.created_by == User.id)
        .where(
            PurchaseReturn.id == return_id,
            PurchaseReturn.outlet_id == outlet_id,
        )
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Purchase return bill not found")
    pr, item_name, user_name = row[0], row[1], row[2]
    return {
        "id": pr.id,
        "return_number": pr.return_number,
        "outlet_id": pr.outlet_id,
        "intake_id": pr.intake_id,
        "item_id": pr.item_id,
        "item_name": item_name,
        "supplier_name": pr.supplier_name,
        "batch_number": pr.batch_number,
        "quantity": pr.quantity,
        "unit_cost": pr.unit_cost,
        "total_refund_amount": pr.total_refund_amount,
        "reason": pr.reason,
        "notes": pr.notes,
        "created_by": pr.created_by,
        "created_by_name": user_name or "System Admin",
        "created_at": pr.created_at,
    }


async def reconcile_item_stock_from_batches(db: AsyncSession, item_id: uuid.UUID) -> Decimal:
    """
    Synchronizes an item's current_stock with the sum of its active batches' remaining_quantity.
    For any product that tracks batches, the sum of remaining quantities is the single source of truth.
    """
    inv_item = await db.get(InventoryItem, item_id)
    if not inv_item:
        return Decimal("0.000")

    batch_sum_stmt = select(
        func.coalesce(func.sum(StockIntake.remaining_quantity), Decimal("0.000"))
    ).where(
        StockIntake.item_id == item_id,
    )
    batch_sum_res = await db.execute(batch_sum_stmt)
    total_batch_stock = batch_sum_res.scalar() or Decimal("0.000")

    has_batches_stmt = select(func.count(StockIntake.id)).where(StockIntake.item_id == item_id)
    has_batches_res = await db.execute(has_batches_stmt)
    batch_count = has_batches_res.scalar() or 0

    if batch_count > 0:
        if inv_item.current_stock != total_batch_stock:
            inv_item.current_stock = total_batch_stock
            await db.flush()

    return inv_item.current_stock


async def restore_customer_return_to_batch(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_id: uuid.UUID,
    return_qty: Decimal,
    order_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> None:
    """
    Restores customer return stock back to its original intake batch (or recent active batch),
    updating both StockIntake.remaining_quantity and InventoryItem.current_stock.
    """
    inv_item = await db.get(InventoryItem, item_id)
    if not inv_item:
        return

    remaining_to_restore = return_qty

    if order_id:
        # Trace original batch intake IDs from order's StockLedger AUTO_DEDUCTION entries
        stmt = (
            select(StockLedger)
            .where(
                StockLedger.reference_order_id == order_id,
                StockLedger.item_id == item_id,
                StockLedger.change_type == StockChangeTypeEnum.AUTO_DEDUCTION,
                StockLedger.intake_id.is_not(None),
            )
            .order_by(StockLedger.created_at.desc())
        )
        res = await db.execute(stmt)
        ledger_entries = res.scalars().all()

        for entry in ledger_entries:
            if remaining_to_restore <= Decimal("0.000"):
                break
            if not entry.intake_id:
                continue

            batch = await db.get(StockIntake, entry.intake_id)
            if batch:
                # Cap restore to what was deducted from this batch AND headroom up to initial_quantity
                restore_amount = min(remaining_to_restore, abs(entry.quantity_change))
                max_intake = batch.initial_quantity if batch.initial_quantity is not None else batch.quantity
                headroom = max(Decimal("0.000"), max_intake - batch.remaining_quantity)
                restore_amount = min(restore_amount, headroom)

                if restore_amount > Decimal("0.000"):
                    batch.remaining_quantity += restore_amount
                    remaining_to_restore -= restore_amount

                    # Log RESTOCK ledger entry linked to original intake batch
                    restock_entry = StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        item_id=item_id,
                        intake_id=batch.id,
                        batch_balance=batch.remaining_quantity,
                        change_type=StockChangeTypeEnum.RESTOCK,
                        quantity_change=restore_amount,
                        resulting_stock=inv_item.current_stock + (return_qty - remaining_to_restore),
                        reference_order_id=order_id,
                        unit_cost_snapshot=batch.unit_cost,
                        created_by=user_id,
                    )
                    db.add(restock_entry)

        # If remaining_to_restore > 0 after checking all batched deductions,
        # that leftover was an unbatched/oversell deduction (intake_id = None).
        # We record an unbatched RESTOCK for audit without creating phantom batch stock.
        if remaining_to_restore > Decimal("0.000"):
            unbatched_entry = StockLedger(
                id=uuid.uuid4(),
                outlet_id=outlet_id,
                item_id=item_id,
                intake_id=None,
                change_type=StockChangeTypeEnum.RESTOCK,
                quantity_change=remaining_to_restore,
                resulting_stock=inv_item.current_stock + return_qty,
                reference_order_id=order_id,
                unit_cost_snapshot=inv_item.cost_per_unit,
                created_by=user_id,
            )
            db.add(unbatched_entry)
            remaining_to_restore = Decimal("0.000")

    else:
        # No order_id provided: unreferenced manual return, restore to most recent batch if headroom exists
        if remaining_to_restore > Decimal("0.000"):
            recent_stmt = (
                select(StockIntake)
                .where(StockIntake.item_id == item_id, StockIntake.outlet_id == outlet_id)
                .order_by(StockIntake.intake_date.desc())
            )
            recent_res = await db.execute(recent_stmt)
            recent_batch = recent_res.scalars().first()

            if recent_batch:
                max_intake = recent_batch.initial_quantity if recent_batch.initial_quantity is not None else recent_batch.quantity
                headroom = max(Decimal("0.000"), max_intake - recent_batch.remaining_quantity)
                restore_amount = min(remaining_to_restore, headroom)
                if restore_amount > Decimal("0.000"):
                    recent_batch.remaining_quantity += restore_amount
                    restock_entry = StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        item_id=item_id,
                        intake_id=recent_batch.id,
                        batch_balance=recent_batch.remaining_quantity,
                        change_type=StockChangeTypeEnum.RESTOCK,
                        quantity_change=restore_amount,
                        resulting_stock=inv_item.current_stock + return_qty,
                        reference_order_id=order_id,
                        unit_cost_snapshot=recent_batch.unit_cost,
                        created_by=user_id,
                    )
                    db.add(restock_entry)

    # Master stock update & automatic reconciliation
    inv_item.current_stock += return_qty
    await db.flush()
    await reconcile_item_stock_from_batches(db, item_id)



