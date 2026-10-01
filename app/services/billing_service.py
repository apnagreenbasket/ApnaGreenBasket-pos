"""
Billing Service — manual bill creation, discount application with approval workflows, cash/UPI payment settlement, and inventory auto-deduction integration.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.core.datetime_utils import utc_now, ensure_naive_utc

logger = logging.getLogger(__name__)

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bill_discount_approval import BillDiscountApproval
from app.models.customer_return import CustomerReturn
from app.models.enums import OrderStatusEnum, RoleEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.user import User

from app.schemas.billing import (
    ApplyDiscountRequest,
    ApproveDiscountRequest,
    CreateManualBillRequest,
    MarkPaidRequest,
    UpdateManualBillRequest,
)
from app.schemas.return_ledger import (
    ItemReturnLedgerResponse,
    ItemReturnLedgerRow,
    ItemReturnLedgerSummary,
)
from app.services.inventory_service import process_order_auto_deduction
from app.services.outbox_service import append_to_outbox
from app.models.customer_ledger import CustomerLedger
import csv
import io



def _get_user_id(user: Any) -> uuid.UUID:
    return getattr(user, "user_id", None) or getattr(user, "id", None)


async def _resolve_item_unit(db: AsyncSession, item_in_unit: str | None, menu_item: MenuItem | None) -> str:
    if item_in_unit and item_in_unit.strip():
        return item_in_unit.strip()
    if menu_item:
        if menu_item.inventory_item_id:
            inv_item = await db.get(InventoryItem, menu_item.inventory_item_id)
            if inv_item and inv_item.unit:
                return str(inv_item.unit)
        if getattr(menu_item, "unit_label", None):
            return str(menu_item.unit_label)
    return "piece"


async def create_manual_bill(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_user: Any,
    data: CreateManualBillRequest,
    order_id: uuid.UUID | None = None,
) -> Order:
    """Create a draft manual bill with line items and snapshot pricing."""
    # Auto-register / link Customer account if phone number provided
    cust_id = None
    cust = None
    if data.customer_phone and data.customer_phone.strip():
        from app.services.customer_service import create_customer
        cust = await create_customer(
            db,
            outlet_id,
            name=data.customer_name or "POS Customer",
            phone=data.customer_phone,
            extra_detail=data.customer_extra_detail,
            gstin=getattr(data, "customer_gstin", None),
            legal_name=getattr(data, "customer_legal_name", None),
        )
        cust_id = cust.id

    replaces_bill_uuid = None
    if getattr(data, "replaces_bill_id", None):
        try:
            replaces_bill_uuid = uuid.UUID(data.replaces_bill_id)
        except Exception as e:
            print(f"Invalid replaces_bill_id: {e}")

    order = Order(
        id=order_id or uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number=data.basket_number or "WALK-IN",
        customer_id=cust_id,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_balance=cust.credit_balance if cust else None,
        status=OrderStatusEnum.PENDING,
        source="manual",
        created_by_staff_id=_get_user_id(staff_user),
        replaces_bill_id=replaces_bill_uuid,
        subtotal_amount=Decimal("0.00"),
        total_amount=Decimal("0.00"),
        discount_status="NONE",
        is_interstate=bool(getattr(data, "is_interstate", False)),
        place_of_supply=getattr(data, "place_of_supply", None),
    )
    
    # Inherit discount if replacing a bill
    if replaces_bill_uuid:
        old_order = await db.get(Order, replaces_bill_uuid)
        if old_order and old_order.discount_status == "APPROVED" and old_order.discount_type:
            order.discount_status = "APPROVED"
            order.discount_reason = old_order.discount_reason or "Inherited from edited bill"
            order.discount_approved_by = old_order.discount_approved_by
            if old_order.discount_type == "PERCENT" or old_order.discount_type.startswith("COMPLIMENTARY"):
                order.discount_type = old_order.discount_type
                order.discount_value = old_order.discount_value
            elif old_order.discount_type == "FLAT":
                # Convert FLAT to PERCENT proportionally based on old subtotal
                old_sub = float(old_order.subtotal_amount or 0)
                old_val = float(old_order.discount_value or 0)
                if old_sub > 0:
                    order.discount_type = "PERCENT"
                    order.discount_value = Decimal(str(round((old_val / old_sub) * 100, 2)))
    
    db.add(order)
    await db.flush()

    subtotal = Decimal("0.00")
    paid_subtotal = Decimal("0.00")
    comp_value = Decimal("0.00")
    total_tax = Decimal("0.00")

    # Fetch outlet's evening price toggle once
    from app.models.outlet import Outlet as OutletModel
    _outlet_result = await db.execute(select(OutletModel.evening_price_active).where(OutletModel.id == outlet_id))
    _evening_active = _outlet_result.scalar_one_or_none() or False

    for item_in in data.items:
        menu_item_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
        menu_item = await db.get(MenuItem, menu_item_uuid) if menu_item_uuid else None
        if not menu_item or menu_item.outlet_id != outlet_id:
            raise HTTPException(status_code=404, detail=f"Menu item {item_in.menu_item_id} not found.")

        # Determine conversion multiplier for alternate units (e.g. 1 pair = 2 pieces)
        unit_multiplier = Decimal("1.0")
        if item_in.selected_unit:
            from app.services.inventory_service import get_unit_conversion_multiplier
            unit_multiplier = get_unit_conversion_multiplier(item_in.selected_unit, menu_item=menu_item)

        # Enforce allow_oversell: If overselling is disabled on MenuItem or linked InventoryItem, block when stock is insufficient
        target_inv = None
        if menu_item and menu_item.inventory_item_id:
            target_inv = await db.get(InventoryItem, menu_item.inventory_item_id)
        elif menu_item and menu_item.barcode:
            inv_res = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.outlet_id == outlet_id,
                    InventoryItem.barcode == menu_item.barcode,
                )
            )
            target_inv = inv_res.scalar_one_or_none()

        item_allows_oversell = getattr(menu_item, "allow_oversell", True)
        if target_inv and not getattr(target_inv, "allow_oversell", True):
            item_allows_oversell = False

        if not item_allows_oversell:
            needed_inv_qty = Decimal(str(item_in.quantity)) * unit_multiplier
            current_avail = target_inv.current_stock if target_inv else Decimal("0.000")
            if current_avail < needed_inv_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Item '{menu_item.name}' does not allow overselling and has only {max(Decimal('0'), current_avail)} in stock."
                )

        # Determine price based on custom unit_price, WHOLESALE pricing_type, or standard RETAIL price
        if item_in.unit_price is not None:
            price = Decimal(str(item_in.unit_price))
        elif getattr(item_in, "pricing_type", "RETAIL") == "WHOLESALE" and menu_item.wholesale_price is not None:
            w_price = Decimal(str(menu_item.wholesale_price))
            if menu_item.is_on_offer and menu_item.offer_price is not None and menu_item.offer_price > Decimal("0.00"):
                price = min(w_price, menu_item.offer_price)
            else:
                price = w_price
            price = price * unit_multiplier
        else:
            price = Decimal(str(menu_item.resolve_price(_evening_active))) * unit_multiplier

        variant_uuid = uuid.UUID(str(item_in.variant_id)) if item_in.variant_id else None
        if variant_uuid:
            variant = await db.get(MenuItemVariant, variant_uuid)
            if variant and variant.menu_item_id == menu_item.id:
                price += Decimal(str(variant.price_delta)) * unit_multiplier

        # MRP calculation:
        # Scale base MRP by alternate unit factor, and ensure MRP is never lower than unit price
        if item_in.mrp is not None:
            passed_mrp = Decimal(str(item_in.mrp))
            if unit_multiplier != Decimal("1.0"):
                if menu_item and menu_item.mrp is not None and passed_mrp == Decimal(str(menu_item.mrp)):
                    item_mrp = max(passed_mrp * unit_multiplier, price)
                elif passed_mrp < price:
                    item_mrp = max(passed_mrp * unit_multiplier, price)
                else:
                    item_mrp = max(passed_mrp, price)
            else:
                item_mrp = max(passed_mrp, price)
        elif menu_item and menu_item.mrp is not None:
            item_mrp = max(Decimal(str(menu_item.mrp)) * unit_multiplier, price)
        else:
            item_mrp = price

        item_tax_rate = Decimal(str(item_in.tax_rate)) if item_in.tax_rate is not None else (menu_item.tax_rate or Decimal("0.00"))

        item_subtotal = price * Decimal(str(item_in.quantity))
        if not item_in.is_complimentary and item_tax_rate > Decimal("0.00"):
            base_amt = item_subtotal / (Decimal("1.00") + (item_tax_rate / Decimal("100.00")))
            item_tax = item_subtotal - base_amt
        else:
            item_tax = Decimal("0.00")

        subtotal += item_subtotal
        if not item_in.is_complimentary:
            paid_subtotal += item_subtotal
            total_tax += item_tax
        else:
            comp_value += item_subtotal

        final_item_name = item_in.item_name or (menu_item.name if menu_item else "Item")
        resolved_unit = await _resolve_item_unit(db, item_in.selected_unit, menu_item)

        batch_uuid = None
        if getattr(item_in, "selected_batch_id", None):
            try:
                batch_uuid = uuid.UUID(str(item_in.selected_batch_id))
            except Exception:
                batch_uuid = None

        resolved_hsn = item_in.hsn_code or getattr(menu_item, "hsn_code", None) or (getattr(target_inv, "hsn_code", None) if target_inv else None)

        order_item = OrderItem(
            id=uuid.uuid4(),
            order_id=order.id,
            menu_item_id=menu_item.id if menu_item else None,
            variant_id=variant_uuid,
            selected_batch_id=batch_uuid,
            item_name=final_item_name,
            quantity=item_in.quantity,
            selected_unit=resolved_unit,
            unit_price=price if not item_in.is_complimentary else Decimal("0.00"),
            mrp=item_mrp,
            tax_rate=item_tax_rate,
            tax_category=menu_item.tax_category or "GST 0%",
            hsn_code=resolved_hsn,
            is_complimentary=item_in.is_complimentary,
            line_total=item_subtotal if not item_in.is_complimentary else Decimal("0.00"),
        )
        db.add(order_item)

    order.subtotal_amount = subtotal
    order.total_amount = paid_subtotal

    # Apply inherited discount if present (uses paid_subtotal as base, not gross)
    if order.discount_status == "APPROVED" and order.discount_type:
        disc_val = order.discount_value or Decimal("0.00")
        if order.discount_type == "PERCENT":
            discount_amount = paid_subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), paid_subtotal - discount_amount)
        elif order.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), paid_subtotal - disc_val)
        elif order.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")

    # Auto-set discount metadata when items are marked complimentary at creation
    if comp_value > Decimal("0.00") and order.discount_status == "NONE":
        order.discount_type = "COMPLIMENTARY_ITEMS"
        order.discount_value = comp_value
        order.discount_status = "APPROVED"
        order.discount_reason = order.discount_reason or "Complimentary items"

    if paid_subtotal > Decimal("0.00") and order.total_amount > Decimal("0.00"):
        ratio = order.total_amount / paid_subtotal
        order.tax_amount = (total_tax * ratio).quantize(Decimal("0.01"))
    else:
        order.tax_amount = Decimal("0.00")

    # Evaluate Verification Rules (Anti-theft)
    res_rest = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = res_rest.scalar_one_or_none()
    if outlet:
        # Manual bills created by staff are auto-verified
        order.is_auto_verified = True

    await db.flush()
    res_final = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items).selectinload(OrderItem.selected_batch))
    )
    final_order = res_final.scalar_one()

    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="bill_created",
        payload={
            "local_order_id": str(final_order.id),
            "staff_id": str(_get_user_id(staff_user)),
            "bill_data": data.model_dump(mode="json"),
        }
    )

    return final_order


async def update_manual_bill(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    data: UpdateManualBillRequest,
) -> Order:
    """Update line items or basket info on a draft bill."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
            Order.source == "manual",
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Manual bill not found.")

    if order.finalized_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit a finalized bill.")

    if data.basket_number is not None:
        order.basket_number = data.basket_number

    if hasattr(data, "is_interstate") and data.is_interstate is not None:
        order.is_interstate = bool(data.is_interstate)
    if hasattr(data, "place_of_supply") and data.place_of_supply is not None:
        order.place_of_supply = data.place_of_supply
    if hasattr(data, "replaces_bill_id") and data.replaces_bill_id is not None:
        try:
            order.replaces_bill_id = uuid.UUID(str(data.replaces_bill_id)) if data.replaces_bill_id else None
        except Exception:
            pass

    if data.customer_phone and data.customer_phone.strip():

        from app.services.customer_service import create_customer
        cust = await create_customer(
            db,
            outlet_id,
            name=data.customer_name or order.customer_name or "POS Customer",
            phone=data.customer_phone,
            extra_detail=getattr(data, "customer_extra_detail", None),
            gstin=getattr(data, "customer_gstin", None),
            legal_name=getattr(data, "customer_legal_name", None),
        )
        order.customer_id = cust.id
        order.customer_phone = cust.phone
        order.customer_name = cust.name
    elif data.customer_phone == "":
        order.customer_id = None
        order.customer_phone = None
        order.customer_name = None
    elif data.customer_name is not None:
        order.customer_name = data.customer_name

    if data.items:
        # Delete existing items
        for existing in order.items:
            await db.delete(existing)
        await db.flush()

        # Fetch outlet's evening price toggle once
        from app.models.outlet import Outlet as OutletModel
        _outlet_result = await db.execute(select(OutletModel.evening_price_active).where(OutletModel.id == outlet_id))
        _evening_active = _outlet_result.scalar_one_or_none() or False

        subtotal = Decimal("0.00")
        paid_subtotal = Decimal("0.00")
        comp_value = Decimal("0.00")
        total_tax = Decimal("0.00")
        for item_in in data.items:
            menu_item_uuid = uuid.UUID(str(item_in.menu_item_id)) if item_in.menu_item_id else None
            menu_item = await db.get(MenuItem, menu_item_uuid) if menu_item_uuid else None

            unit_multiplier = Decimal("1.0")
            if item_in.selected_unit:
                from app.services.inventory_service import get_unit_conversion_multiplier
                unit_multiplier = get_unit_conversion_multiplier(item_in.selected_unit, menu_item=menu_item)

            # Enforce allow_oversell: If overselling is disabled on MenuItem or linked InventoryItem, block when stock is insufficient
            target_inv = None
            if menu_item and menu_item.inventory_item_id:
                target_inv = await db.get(InventoryItem, menu_item.inventory_item_id)
            elif menu_item and menu_item.barcode:
                inv_res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.outlet_id == outlet_id,
                        InventoryItem.barcode == menu_item.barcode,
                    )
                )
                target_inv = inv_res.scalar_one_or_none()

            item_allows_oversell = getattr(menu_item, "allow_oversell", True)
            if target_inv and not getattr(target_inv, "allow_oversell", True):
                item_allows_oversell = False

            if not item_allows_oversell:
                needed_inv_qty = Decimal(str(item_in.quantity)) * unit_multiplier
                current_avail = target_inv.current_stock if target_inv else Decimal("0.000")
                if current_avail < needed_inv_qty:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Item '{menu_item.name}' does not allow overselling and has only {max(Decimal('0'), current_avail)} in stock."
                    )

            if item_in.unit_price is not None:
                price = Decimal(str(item_in.unit_price))
            elif menu_item:
                if getattr(item_in, "pricing_type", "RETAIL") == "WHOLESALE" and menu_item.wholesale_price is not None:
                    w_price = Decimal(str(menu_item.wholesale_price))
                    if menu_item.is_on_offer and menu_item.offer_price is not None and menu_item.offer_price > Decimal("0.00"):
                        price = min(w_price, menu_item.offer_price)
                    else:
                        price = w_price
                    price = price * unit_multiplier
                else:
                    price = Decimal(str(menu_item.resolve_price(_evening_active))) * unit_multiplier
            else:
                price = Decimal("0.00")

            variant_uuid = uuid.UUID(str(item_in.variant_id)) if item_in.variant_id else None
            if variant_uuid and menu_item:
                variant = await db.get(MenuItemVariant, variant_uuid)
                if variant and variant.menu_item_id == menu_item.id:
                    price += Decimal(str(variant.price_delta)) * unit_multiplier

            # MRP calculation:
            # Scale base MRP by alternate unit factor, and ensure MRP is never lower than unit price
            if item_in.mrp is not None:
                passed_mrp = Decimal(str(item_in.mrp))
                if unit_multiplier != Decimal("1.0"):
                    if menu_item and menu_item.mrp is not None and passed_mrp == Decimal(str(menu_item.mrp)):
                        item_mrp = max(passed_mrp * unit_multiplier, price)
                    elif passed_mrp < price:
                        item_mrp = max(passed_mrp * unit_multiplier, price)
                    else:
                        item_mrp = max(passed_mrp, price)
                else:
                    item_mrp = max(passed_mrp, price)
            elif menu_item and menu_item.mrp is not None:
                item_mrp = max(Decimal(str(menu_item.mrp)) * unit_multiplier, price)
            else:
                item_mrp = price

            item_tax_rate = Decimal(str(item_in.tax_rate)) if item_in.tax_rate is not None else ((menu_item.tax_rate if menu_item else None) or Decimal("0.00"))

            item_subtotal = price * Decimal(str(item_in.quantity))
            if not item_in.is_complimentary and item_tax_rate > Decimal("0.00"):
                base_amt = item_subtotal / (Decimal("1.00") + (item_tax_rate / Decimal("100.00")))
                item_tax = item_subtotal - base_amt
            else:
                item_tax = Decimal("0.00")

            subtotal += item_subtotal
            if not item_in.is_complimentary:
                paid_subtotal += item_subtotal
                total_tax += item_tax
            else:
                comp_value += item_subtotal

            final_item_name = item_in.item_name or (menu_item.name if menu_item else "Item")
            resolved_unit = await _resolve_item_unit(db, item_in.selected_unit, menu_item)

            batch_uuid = None
            if getattr(item_in, "selected_batch_id", None):
                try:
                    batch_uuid = uuid.UUID(str(item_in.selected_batch_id))
                except Exception:
                    batch_uuid = None

            resolved_hsn = item_in.hsn_code or (menu_item.hsn_code if menu_item else None) or (target_inv.hsn_code if target_inv else None)

            order_item = OrderItem(
                id=uuid.uuid4(),
                order_id=order.id,
                menu_item_id=menu_item.id if menu_item else None,
                variant_id=variant_uuid,
                selected_batch_id=batch_uuid,
                item_name=final_item_name,
                quantity=item_in.quantity,
                selected_unit=resolved_unit,
                unit_price=price if not item_in.is_complimentary else Decimal("0.00"),
                mrp=item_mrp,
                tax_rate=item_tax_rate,
                tax_category=(menu_item.tax_category if menu_item else None) or "GST 0%",
                hsn_code=resolved_hsn,
                is_complimentary=item_in.is_complimentary,
                line_total=item_subtotal if not item_in.is_complimentary else Decimal("0.00"),
            )
            db.add(order_item)

        order.subtotal_amount = subtotal
        gross_total = subtotal

        # Re-apply discount if bill has an approved discount (uses paid_subtotal as base)
        if order.discount_status == "APPROVED" and order.discount_type:
            disc_val = order.discount_value or Decimal("0.00")
            if order.discount_type == "PERCENT":
                discount_amount = paid_subtotal * (disc_val / Decimal("100"))
                order.total_amount = max(Decimal("0.00"), paid_subtotal - discount_amount)
            elif order.discount_type == "FLAT":
                order.total_amount = max(Decimal("0.00"), paid_subtotal - disc_val)
            elif order.discount_type == "COMPLIMENTARY":
                order.total_amount = Decimal("0.00")
            elif order.discount_type == "COMPLIMENTARY_ITEMS":
                order.total_amount = paid_subtotal
                order.discount_value = comp_value
            else:
                order.total_amount = paid_subtotal
        else:
            order.total_amount = paid_subtotal

        # Auto-set discount metadata when items are marked complimentary
        if comp_value > Decimal("0.00") and order.discount_status == "NONE":
            order.discount_type = "COMPLIMENTARY_ITEMS"
            order.discount_value = comp_value
            order.discount_status = "APPROVED"
            order.discount_reason = order.discount_reason or "Complimentary items"

        if paid_subtotal > Decimal("0.00") and order.total_amount > Decimal("0.00"):
            ratio = order.total_amount / paid_subtotal
            order.tax_amount = (total_tax * ratio).quantize(Decimal("0.01"))
        else:
            order.tax_amount = Decimal("0.00")

    await db.flush()
    res = await db.execute(
        select(Order).options(selectinload(Order.items).selectinload(OrderItem.selected_batch)).where(Order.id == order.id)
    )
    return res.scalar_one()


def _recalculate_order_tax(order: Order) -> None:
    subtotal = order.subtotal_amount or Decimal("0.00")
    total_amount = order.total_amount or Decimal("0.00")
    if subtotal <= Decimal("0.00") or total_amount <= Decimal("0.00") or not getattr(order, "items", None):
        order.tax_amount = Decimal("0.00")
        return

    base_tax = Decimal("0.00")
    paid_items_value = Decimal("0.00")
    for item in order.items:
        rate = item.tax_rate or Decimal("0.00")
        if not item.is_complimentary:
            price = item.unit_price or Decimal("0.00")
            qty = Decimal(str(item.quantity)) if item.quantity is not None else Decimal("1.00")
            l_total = price * qty
            paid_items_value += l_total
            if rate > Decimal("0.00"):
                base_amt = l_total / (Decimal("1.00") + (rate / Decimal("100.00")))
                base_tax += (l_total - base_amt)

    # Use paid items value as denominator to prevent complimentary items from deflating ratio
    denom = paid_items_value if paid_items_value > Decimal("0.00") else subtotal
    ratio = total_amount / denom
    order.tax_amount = (base_tax * ratio).quantize(Decimal("0.01"))


def _apply_item_level_complimentary(db: AsyncSession, order: Order, item_quantities: dict) -> None:
    """Helper to apply partial or full complimentary flags to specific order items."""
    for item in list(order.items):
        item_id_str = str(item.id)
        if item_id_str in item_quantities:
            comp_qty = Decimal(str(item_quantities[item_id_str]))
            if comp_qty <= Decimal("0.00"):
                continue
            
            current_qty = Decimal(str(item.quantity)) if item.quantity is not None else Decimal("1.00")
            
            if comp_qty >= current_qty:
                item.is_complimentary = True
                item.line_total = Decimal("0.00")
            else:
                # Split item
                paid_qty = current_qty - comp_qty
                
                # Update existing item to paid portion
                item.quantity = float(paid_qty)
                item.line_total = (item.unit_price or Decimal("0.00")) * paid_qty
                
                # Create complimentary portion
                from app.models.order_item import OrderItem
                import uuid
                new_item = OrderItem(
                    id=uuid.uuid4(),
                    order_id=order.id,
                    menu_item_id=item.menu_item_id,
                    variant_id=item.variant_id,
                    item_name=item.item_name,
                    quantity=float(comp_qty),
                    selected_unit=item.selected_unit,
                    unit_price=item.unit_price,
                    mrp=item.mrp,
                    tax_rate=item.tax_rate,
                    tax_category=item.tax_category,
                    hsn_code=item.hsn_code,
                    is_complimentary=True,
                    line_total=Decimal("0.00")
                )
                db.add(new_item)
                order.items.append(new_item)
    
    # Recalculate totals
    paid_subtotal = sum(i.line_total for i in order.items if not i.is_complimentary and i.line_total)
    order.discount_value = (order.subtotal_amount or Decimal("0.00")) - paid_subtotal
    order.total_amount = paid_subtotal


async def apply_discount(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    staff_user: User,
    data: ApplyDiscountRequest,
) -> Order:
    """Apply discount to bill. Auto-approve if Manager/Admin; otherwise require approval."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    user_role_raw = getattr(staff_user, "role", "")
    user_role_str = (user_role_raw.value if hasattr(user_role_raw, "value") else str(user_role_raw)).upper()
    is_manager_or_admin = any(r in user_role_str for r in ["SUPERADMIN", "ADMIN", "MANAGER", "OWNER"])

    subtotal = order.subtotal_amount or order.total_amount or Decimal("0.00")
    disc_val = Decimal(str(data.discount_value))

    if is_manager_or_admin:
        # Calculate new total immediately
        if data.discount_type == "PERCENT":
            discount_amount = subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
            order.discount_value = disc_val
        elif data.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
            order.discount_value = disc_val
        elif data.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")
            order.discount_value = subtotal
        elif data.discount_type == "COMPLIMENTARY_ITEMS" and data.item_complimentary_quantities:
            _apply_item_level_complimentary(db, order, data.item_complimentary_quantities)

        order.discount_type = data.discount_type
        if data.discount_type != "COMPLIMENTARY_ITEMS":
            order.discount_value = disc_val
        order.discount_reason = data.reason_note
        order.discount_status = "APPROVED"
        _recalculate_order_tax(order)
    else:
        # Requires manager approval
        order.discount_type = data.discount_type
        order.discount_value = disc_val
        order.discount_reason = data.reason_note
        order.discount_status = "PENDING_APPROVAL"

        approval = BillDiscountApproval(
            id=uuid.uuid4(),
            order_id=order.id,
            requested_by_id=_get_user_id(staff_user),
            status="PENDING",
            discount_type=data.discount_type,
            discount_value=disc_val,
            reason_note=data.reason_note,
            complimentary_items=data.item_complimentary_quantities if data.discount_type == "COMPLIMENTARY_ITEMS" else None
        )
        db.add(approval)

    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="discount_applied",
        payload={
            "order_id": str(order_id),
            "staff_id": str(_get_user_id(staff_user)),
            "discount_data": data.model_dump(mode="json"),
        }
    )

    await db.flush()
    return order


async def approve_discount(
    db: AsyncSession,
    approval_id: uuid.UUID,
    outlet_id: uuid.UUID,
    manager_user: Any,
    approve: bool,
) -> BillDiscountApproval:
    """Manager/Admin approves or rejects a pending discount request."""
    if manager_user.role not in [RoleEnum.SUPERADMIN, RoleEnum.OUTLET_ADMIN, RoleEnum.MANAGER]:
        raise HTTPException(status_code=403, detail="Only Managers or Admins can resolve discount approvals.")

    res = await db.execute(
        select(BillDiscountApproval)
        .join(Order, BillDiscountApproval.order_id == Order.id)
        .where(
            BillDiscountApproval.id == approval_id,
            Order.outlet_id == outlet_id,
            BillDiscountApproval.status == "PENDING",
        )
    )
    approval = res.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Pending discount approval not found.")

    order_res = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == approval.order_id)
    )
    order = order_res.scalar_one()

    approval.approved_by_id = _get_user_id(manager_user)
    approval.resolved_at = utc_now()

    if approve:
        approval.status = "APPROVED"
        order.discount_status = "APPROVED"
        subtotal = order.subtotal_amount or Decimal("0.00")
        disc_val = approval.discount_value

        if approval.discount_type == "PERCENT":
            discount_amount = subtotal * (disc_val / Decimal("100"))
            order.total_amount = max(Decimal("0.00"), subtotal - discount_amount)
        elif approval.discount_type == "FLAT":
            order.total_amount = max(Decimal("0.00"), subtotal - disc_val)
        elif approval.discount_type == "COMPLIMENTARY":
            order.total_amount = Decimal("0.00")
            order.discount_value = subtotal
        elif approval.discount_type == "COMPLIMENTARY_ITEMS" and approval.complimentary_items:
            _apply_item_level_complimentary(db, order, approval.complimentary_items)

        _recalculate_order_tax(order)
    else:
        approval.status = "REJECTED"
        order.discount_status = "REJECTED"
        order.total_amount = order.subtotal_amount
        _recalculate_order_tax(order)

    await db.flush()
    return approval


async def finalize_bill(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
) -> Order:
    """Lock draft bill from further item edits."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    order.finalized_at = utc_now()
    
    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="bill_finalized",
        payload={"order_id": str(order_id)}
    )
    
    await db.flush()
    return order


async def mark_bill_paid(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
    payment_method: str,
    cash_denominations: dict[str, int] | None = None,
    change_denominations: dict[str, int] | None = None,
    redeem_loyalty_points: int = 0,
    delivery_charge: Decimal = Decimal("0.00"),
    handling_charge: Decimal = Decimal("0.00"),
    apply_credit: Decimal = Decimal("0.00"),
    record_debit: Decimal = Decimal("0.00"),
    record_credit: Decimal = Decimal("0.00"),
    debt_settled: Decimal = Decimal("0.00"),
    credit_cashed_out: Decimal = Decimal("0.00"),
    cash_amount: Decimal | None = None,
    upi_amount: Decimal | None = None,
    staff_user: Any = None,
) -> Order:
    """Record cash/UPI/SPLIT payment method, set order status to COMPLETED for POS bills, and trigger inventory auto-deduction."""
    res = await db.execute(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.selected_batch))
        .where(
            Order.id == order_id,
            Order.outlet_id == outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    if order.status in (OrderStatusEnum.COMPLETED, OrderStatusEnum.PAID, OrderStatusEnum.PARTIALLY_REFUNDED, OrderStatusEnum.REFUNDED, OrderStatusEnum.CANCELLED):
        raise HTTPException(
            status_code=400,
            detail=f"Bill #{order.basket_number or str(order.id)[:8]} is already {order.status.value}."
        )

    if not order.customer_id and (apply_credit > 0 or record_debit > 0 or record_credit > 0 or debt_settled > 0 or credit_cashed_out > 0):
        raise HTTPException(status_code=400, detail="Cannot process Udhaar or Store Credit without linking a customer first.")

    net_payable = max(Decimal("0.00"), Decimal(str(order.total_amount or 0)) + delivery_charge + handling_charge - apply_credit - record_debit)
    max_direct_payable = net_payable + max(Decimal("0.00"), record_credit)
    final_cash = Decimal(str(cash_amount)) if cash_amount is not None else None
    final_upi = Decimal(str(upi_amount)) if upi_amount is not None else None

    if final_cash is not None and final_cash > max_direct_payable:
        final_cash = max_direct_payable
    if final_upi is not None and final_upi > max_direct_payable:
        final_upi = max_direct_payable

    is_split = (payment_method == "SPLIT") or (final_upi is not None and final_upi > 0 and ((final_cash is not None and final_cash > 0) or payment_method == "CASH"))

    if is_split:
        order.payment_method = "SPLIT"
        c = final_cash if final_cash is not None else max(Decimal("0.00"), max_direct_payable - (final_upi or Decimal("0.00")))
        u = final_upi if final_upi is not None else max(Decimal("0.00"), max_direct_payable - c)
        if c + u > max_direct_payable:
            u = max(Decimal("0.00"), max_direct_payable - c)
        order.cash_amount = c
        order.upi_amount = u
    elif payment_method == "UPI":
        order.payment_method = "UPI"
        order.cash_amount = Decimal("0.00")
        order.upi_amount = min(final_upi, max_direct_payable) if final_upi is not None else max_direct_payable
    else:
        order.payment_method = "CASH"
        order.cash_amount = min(final_cash, max_direct_payable) if final_cash is not None else max_direct_payable
        order.upi_amount = Decimal("0.00")

    if order.payment_method in ("CASH", "SPLIT") or cash_denominations:
        from app.models.cash_drawer_ledger import CashDrawerLedger

        # Sanitize denominations: keep only entries with strictly positive count
        clean_cash_denoms = {str(k): int(v) for k, v in (cash_denominations or {}).items() if int(v) > 0}
        clean_change_denoms = {str(k): int(v) for k, v in (change_denominations or {}).items() if int(v) > 0}

        order.cash_denominations = clean_cash_denoms if clean_cash_denoms else None
        order.change_denominations = clean_change_denoms if clean_change_denoms else None

        denom_strs = [f"₹{k}x{v}" for k, v in clean_cash_denoms.items()]
        if clean_cash_denoms:
            # Write received cash to ledger only when actual notes are present
            ledger_in = CashDrawerLedger(
                outlet_id=outlet_id,
                transaction_type="CUSTOMER_PAYMENT",
                denominations=clean_cash_denoms,
                reference_order_id=order_id,
            )
            db.add(ledger_in)

        change_strs = [f"₹{k}x{v}" for k, v in clean_change_denoms.items()]
        if clean_change_denoms:
            ledger_out = CashDrawerLedger(
                outlet_id=outlet_id,
                transaction_type="CUSTOMER_CHANGE",
                denominations=clean_change_denoms,
                reference_order_id=order_id,
            )
            db.add(ledger_out)

        if is_split:
            order.payment_reference = f"SPLIT [Cash: ₹{order.cash_amount:.2f}, UPI: ₹{order.upi_amount:.2f}]"
        elif denom_strs:
            ref_str = f"CASH [IN: {', '.join(denom_strs)}]"
            if change_strs:
                ref_str += f" [OUT: {', '.join(change_strs)}]"
            order.payment_reference = ref_str
        else:
            order.payment_reference = "CASH"
    elif not order.payment_reference:
        order.payment_reference = payment_method

    # Walk-in POS bills go straight to COMPLETED status without needing manual verification
    order.is_auto_verified = True
    order.status = OrderStatusEnum.COMPLETED
    order.paid_at = utc_now()
    if not order.finalized_at:
        order.finalized_at = utc_now()

    res_outlet = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = res_outlet.scalar_one_or_none()

    from app.models.customer import Customer
    # Loyalty Points Redemption
    discount_inr = Decimal("0.00")
    if redeem_loyalty_points > 0 and outlet and (order.customer_id or order.customer_phone):
        if order.customer_id:
            res_cust = await db.execute(select(Customer).where(Customer.id == order.customer_id, Customer.outlet_id == outlet_id))
        else:
            res_cust = await db.execute(select(Customer).where(Customer.phone == order.customer_phone, Customer.outlet_id == outlet_id))
        cust = res_cust.scalar_one_or_none()
        if cust and cust.loyalty_points >= redeem_loyalty_points:
            import math
            applicable_percentage = Decimal("0.00")
            for tier in outlet.loyalty_redemption_tiers or []:
                min_p = tier.get("min_points", 0)
                max_p = tier.get("max_points")
                if cust.loyalty_points >= min_p and (max_p is None or cust.loyalty_points <= max_p):
                    applicable_percentage = Decimal(str(tier.get("discount_percentage", "0.00")))
                    break

            value_per_point_inr = applicable_percentage / Decimal("100.00")
            requested_discount_inr = Decimal(str(redeem_loyalty_points)) * value_per_point_inr

            max_bill_percentage = Decimal(str(outlet.loyalty_max_bill_percentage or "100.00"))
            current_total_amount = order.total_amount or Decimal("0.00")
            max_allowed_discount_inr = (max_bill_percentage / Decimal("100.00")) * current_total_amount

            discount_inr = min(requested_discount_inr, max_allowed_discount_inr)

            actual_points_deducted = redeem_loyalty_points
            if value_per_point_inr > 0 and requested_discount_inr > max_allowed_discount_inr:
                actual_points_deducted = math.ceil(float(discount_inr / value_per_point_inr))
            
            actual_points_deducted = min(actual_points_deducted, cust.loyalty_points)

            cust.loyalty_points -= actual_points_deducted
            order.loyalty_points_redeemed = actual_points_deducted
            order.loyalty_discount_inr = discount_inr

    # Update delivery and handling charges
    order.delivery_charge = delivery_charge
    order.handling_charge = handling_charge

    # Recalculate Final Amount (Gross Bill Total)
    net_payable = (order.total_amount or Decimal("0.00")) + delivery_charge + handling_charge
    order.total_amount = Decimal(str(round(float(net_payable))))

    # Customer Processing (Loyalty Points, Credit/Debit Ledger & Customer Balance Snapshot)
    cust = None
    if order.customer_id or order.customer_phone:
        if order.customer_id:
            res_cust = await db.execute(select(Customer).where(Customer.id == order.customer_id, Customer.outlet_id == outlet_id))
        else:
            res_cust = await db.execute(select(Customer).where(Customer.phone == order.customer_phone, Customer.outlet_id == outlet_id))
        cust = res_cust.scalar_one_or_none()

    if cust:
        # Loyalty Points Earning
        if outlet and outlet.loyalty_points_per_100_inr > 0:
            earned = round((float(order.total_amount or 0.0) / 100.0) * outlet.loyalty_points_per_100_inr)
            if earned > 0:
                cust.loyalty_points += earned
                order.loyalty_points_earned = earned

        # Credit/Debit Processing
        if (apply_credit > 0 or record_debit > 0 or record_credit > 0 or debt_settled > 0 or credit_cashed_out > 0):
            bill_tag = f"#{order.basket_number}" if (order.basket_number and not str(order.basket_number).upper().startswith("WALK")) else f"#{str(order.id)[:8].upper()}"

            # Apply Credit
            if apply_credit > 0:
                # Deduct from customer's credit balance (whether positive or negative, applying credit lowers the balance)
                cust.credit_balance -= apply_credit
                order.credit_applied = apply_credit
                
                # Log to ledger
                ledger_credit = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="CREDIT_APPLIED",
                    amount=apply_credit,
                    balance_after=cust.credit_balance,
                    note=f"Credit used for Bill {bill_tag}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_credit)

            # Record Debit (Shortfall)
            if record_debit > 0:
                # Customer owes money, so their balance goes down (more negative)
                cust.credit_balance -= record_debit
                order.debit_applied = record_debit
                
                # Log to ledger
                ledger_debit = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="DEBIT_ADDED",
                    amount=record_debit,
                    balance_after=cust.credit_balance,
                    note=f"Shortfall recorded for Bill {bill_tag}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_debit)

            # Settle Debt (Pay off Udhaar)
            if debt_settled > 0:
                cust.credit_balance += debt_settled
                order.debt_settled = debt_settled
                
                # Log to ledger
                ledger_debt_settled = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="DEBIT_SETTLED",
                    amount=debt_settled,
                    balance_after=cust.credit_balance,
                    note=f"Paid off Udhaar (Debt Settled) for Bill {bill_tag}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_debt_settled)

            # Record Credit (Cashier is Short)
            if record_credit > 0:
                cust.credit_balance += record_credit
                order.credit_awarded = record_credit
                
                # Log to ledger
                ledger_credit_awarded = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="CREDIT_ADDED",
                    amount=record_credit,
                    balance_after=cust.credit_balance,
                    note=f"Store credit awarded (Change Shortfall) for Bill {bill_tag}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_credit_awarded)

            # Credit Cashed Out
            if credit_cashed_out > 0:
                cust.credit_balance -= credit_cashed_out
                order.credit_cashed_out = credit_cashed_out
                
                # Log to ledger
                ledger_credit_cashed_out = CustomerLedger(
                    customer_id=cust.id,
                    outlet_id=outlet_id,
                    order_id=order.id,
                    entry_type="CREDIT_USED", # Functionally it is used/withdrawn
                    amount=credit_cashed_out,
                    balance_after=cust.credit_balance,
                    note=f"Store credit cashed out for Bill {bill_tag}",
                    created_by_staff_id=_get_user_id(staff_user) if staff_user else None
                )
                db.add(ledger_credit_cashed_out)
            
        # Always record customer balance snapshot on the order, regardless of credit/debit activity
        order.customer_balance = cust.credit_balance
        order.customer_loyalty_balance = cust.loyalty_points


    # 1. Deferred refund: if this bill replaces an old one, void the old bill first so its stock is restored to batches
    if getattr(order, "replaces_bill_id", None):
        try:
            old_order_res = await db.execute(
                select(Order).options(selectinload(Order.items)).where(
                    Order.id == order.replaces_bill_id,
                    Order.outlet_id == outlet_id,
                )
            )
            old_order = old_order_res.scalar_one_or_none()
            if old_order and old_order.status != OrderStatusEnum.REFUNDED:
                from app.schemas.billing import CustomerReturnRequest, CustomerReturnItemInput
                return_items = []
                for it in old_order.items:
                    rem_qty = float(it.quantity - (it.returned_quantity or 0))
                    if rem_qty > 0:
                        return_items.append(
                            CustomerReturnItemInput(
                                order_item_id=str(it.id),
                                menu_item_id=str(it.menu_item_id) if it.menu_item_id else None,
                                item_name=it.item_name,
                                quantity=rem_qty,
                                unit_price=float(it.unit_price) if it.unit_price is not None else 0.0,
                                reason="EDIT_BILL_VOID"
                            )
                        )
                
                if return_items:
                    return_req = CustomerReturnRequest(
                        order_id=str(old_order.id),
                        customer_name=old_order.customer_name,
                        customer_phone=old_order.customer_phone,
                        return_items=return_items,
                        exchange_items=[],
                        refund_payment_method=old_order.payment_method or "CASH",
                        notes="Automatic return due to bill edit"
                    )
                    try:
                        await process_customer_return(db, outlet_id, None, return_req)
                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to void previous bill #{str(old_order.id)[:8].upper()}: {e}"
                        )
                old_order.status = OrderStatusEnum.REFUNDED
                old_order.is_void = True
                await db.flush()
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            print(f"Failed to process deferred old bill voiding: {e}")
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process deferred old bill voiding: {e}"
            )


    # 2. Trigger recipe auto-deduction for stock management
    await process_order_auto_deduction(db, order)

    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="payment_confirmed",
        payload={
            "order_id": str(order_id),
            "payment_data": {
                "payment_method": payment_method,
                "cash_denominations": cash_denominations
            },
            "confirmed_offline": True,
        }
    )

    await db.flush()
    await db.commit()

    try:
        from app.services.websocket_service import broadcast_catalog_updated
        await broadcast_catalog_updated(outlet_id, reason="BILL_PAID", item_id=str(order_id))
    except Exception as e:
        logger.warning("Failed to broadcast catalog update on bill paid: %s", e)

    return order


async def get_pending_approvals_count(
    db: AsyncSession,
    outlet_id: uuid.UUID,
) -> int:
    """Get count of pending discount approval requests for manager notification badge."""
    stmt = (
        select(func.count(BillDiscountApproval.id))
        .join(Order, BillDiscountApproval.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            BillDiscountApproval.status == "PENDING",
        )
    )
    res = await db.execute(stmt)
    return int(res.scalar() or 0)


async def get_daily_cash_denominations(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    date_str: str | None = None,
) -> dict[str, Any]:
    """
    Get aggregated cash currency denominations collected for a specific date (defaults to today).
    Optimized with SQL date filtering.
    """
    from datetime import datetime, time, timedelta
    from app.core.shift_utils import IST
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except Exception:
            target_date = datetime.now(IST).date()
    else:
        target_date = datetime.now(IST).date()

    target_date_str = target_date.strftime("%Y-%m-%d")
    # DB stores naive UTC. 00:00 IST = 18:30 UTC (previous day)
    start_dt = datetime.combine(target_date, time.min) - timedelta(hours=5, minutes=30)
    end_dt = datetime.combine(target_date, time.max) - timedelta(hours=5, minutes=30)

    stmt = (
        select(Order.cash_denominations, Order.total_amount)
        .where(
            Order.outlet_id == outlet_id,
            Order.payment_method == "CASH",
            Order.status.in_([OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED]),
            func.coalesce(Order.paid_at, Order.created_at) >= start_dt,
            func.coalesce(Order.paid_at, Order.created_at) <= end_dt,
        )
    )
    res = await db.execute(stmt)
    orders = res.all()

    denoms_count = {500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0}
    total_cash_collected = 0.0

    for row in orders:
        total_cash_collected += float(row.total_amount or 0.0)
        cd = row.cash_denominations
        if isinstance(cd, dict):
            for k, v in cd.items():
                try:
                    k_num = int(k)
                    if k_num in denoms_count:
                        denoms_count[k_num] += int(v or 0)
                except (ValueError, TypeError):
                    pass

    return {
        "date": target_date_str,
        "total_cash_collected": total_cash_collected,
        "denominations": {str(k): v for k, v in denoms_count.items()},
        "denomination_subtotals": {str(k): k * v for k, v in denoms_count.items()},
    }


async def process_customer_return(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_user: Any,
    data: Any,
) -> dict[str, Any]:
    """
    Process customer return / exchange for a bill or direct un-billed return.
    Restocks returned items and saves return record to database.
    """
    order: Order | None = None
    customer_name = getattr(data, "customer_name", None)
    customer_phone = getattr(data, "customer_phone", None)
    original_bill_number = None

    # Require a bill reference — un-billed returns are not supported.
    if not getattr(data, "order_id", None):
        raise HTTPException(
            status_code=400,
            detail="A bill reference (order_id) is required to process a return.",
        )

    order_uuid = uuid.UUID(data.order_id)
    order_res = await db.execute(
        select(Order).options(selectinload(Order.items)).where(
            Order.id == order_uuid,
            Order.outlet_id == outlet_id,
        )
    )
    order = order_res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Original bill not found.")

    if order.status not in [OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, OrderStatusEnum.PARTIALLY_REFUNDED]:
        raise HTTPException(
            status_code=400,
            detail="Cannot process return on un-paid, un-finalized, or fully refunded bill."
        )
    customer_name = customer_name or order.customer_name
    customer_phone = customer_phone or order.customer_phone
    original_bill_number = f"#{order.id.hex[:8].upper()}"


    total_return_amount = Decimal("0.00")
    returned_items_summary = []

    for ret_item in data.return_items:
        ret_qty = Decimal(str(ret_item.quantity))
        item_unit_price = Decimal("0.00")
        item_name = ret_item.item_name or "Returned Item"
        menu_item_id = ret_item.menu_item_id

        matching = None
        if order and ret_item.order_item_id:
            item_uuid = uuid.UUID(ret_item.order_item_id)
            matching = next((i for i in order.items if i.id == item_uuid), None)
            if matching:
                item_name = matching.item_name or item_name
                menu_item_id = menu_item_id or (str(matching.menu_item_id) if matching.menu_item_id else None)

        m_item = None
        if menu_item_id:
            try:
                m_item = await db.get(MenuItem, uuid.UUID(menu_item_id))
            except Exception:
                pass

        selected_u = getattr(ret_item, "selected_unit", None) or (
            matching.selected_unit if matching else (m_item.unit_label if m_item else None)
        )

        if matching:
            from app.services.inventory_service import get_unit_conversion_multiplier
            ret_mult = get_unit_conversion_multiplier(selected_u, menu_item=m_item)
            orig_mult = get_unit_conversion_multiplier(matching.selected_unit, menu_item=m_item)
            ratio = (ret_mult / orig_mult) if (orig_mult and orig_mult > 0) else Decimal("1.0")
            add_qty = ret_qty * ratio
            curr_returned = matching.returned_quantity or Decimal("0.000")
            remaining_returnable = matching.quantity - curr_returned
            if add_qty > (remaining_returnable + Decimal("0.001")):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot return {ret_qty} {selected_u} of '{matching.item_name}'. Only {remaining_returnable} {matching.selected_unit} remaining to return."
                )
            matching.returned_quantity = min(matching.quantity, curr_returned + add_qty)

        if ret_item.unit_price is not None:
            item_unit_price = Decimal(str(ret_item.unit_price))
        elif matching:
            item_unit_price = matching.unit_price or Decimal("0.00")

        hsn_code = getattr(ret_item, "hsn_code", None)
        tax_rate = float(getattr(ret_item, "tax_rate", 0.0) or 0.0)
        tax_category = None
        mrp = float(getattr(ret_item, "mrp", item_unit_price) or item_unit_price)

        if matching:
            hsn_code = matching.hsn_code or hsn_code
            if matching.tax_rate is not None:
                tax_rate = float(matching.tax_rate)
            tax_category = matching.tax_category
            if matching.mrp is not None:
                mrp = float(matching.mrp)
        elif m_item:
            hsn_code = hsn_code or m_item.hsn_code
            if m_item.tax_rate is not None:
                tax_rate = float(m_item.tax_rate)
            tax_category = m_item.tax_category
            if m_item.mrp is not None:
                mrp = float(m_item.mrp)

        line_refund = item_unit_price * ret_qty
        total_return_amount += line_refund

        returned_items_summary.append({
            "order_item_id": ret_item.order_item_id,
            "menu_item_id": menu_item_id,
            "item_name": item_name,
            "quantity": float(ret_qty),
            "selected_unit": selected_u,
            "unit_price": float(item_unit_price),
            "mrp": mrp,
            "line_refund": float(line_refund),
            "tax_rate": tax_rate,
            "tax_category": tax_category,
            "hsn_code": hsn_code,
            "reason": ret_item.reason or "CUSTOMER_RETURN",
        })

        # Restock inventory item and original intake batch if linked to a MenuItem
        if m_item and m_item.inventory_item_id:
            try:
                from app.services.inventory_service import (
                    restore_customer_return_to_batch,
                    get_unit_conversion_multiplier,
                )
                inv_item = await db.get(InventoryItem, m_item.inventory_item_id)
                multiplier = get_unit_conversion_multiplier(
                    selected_u, inv_item=inv_item, menu_item=m_item
                )
                converted_ret_qty = ret_qty * multiplier
                await restore_customer_return_to_batch(
                    db=db,
                    outlet_id=outlet_id,
                    item_id=m_item.inventory_item_id,
                    return_qty=converted_ret_qty,
                    order_id=order.id if order else None,
                )
            except Exception as e:
                print(f"⚠️ [Customer Return Restock Error] {e}")

    if order:
        all_returned = True
        any_returned = False
        for item in order.items:
            if item.returned_quantity > Decimal("0.000"):
                any_returned = True
            if item.returned_quantity < item.quantity:
                all_returned = False
        if all_returned:
            order.status = OrderStatusEnum.REFUNDED
        elif any_returned:
            order.status = OrderStatusEnum.PARTIALLY_REFUNDED

    # Process exchange items if present
    exchange_items_summary = []
    total_exchange_amount = Decimal("0.00")
    for ex_item in (data.exchange_items or []):
        if isinstance(ex_item, dict):
            ex_qty = Decimal(str(ex_item.get("quantity", 0)))
            ex_price = Decimal(str(ex_item.get("unit_price", 0) or 0))
            raw_id = ex_item.get("menu_item_id")
            item_name = ex_item.get("item_name") or "Exchange Item"
            selected_unit = ex_item.get("selected_unit")
        else:
            ex_qty = Decimal(str(getattr(ex_item, "quantity", 0)))
            ex_price = Decimal(str(getattr(ex_item, "unit_price", 0) or 0))
            raw_id = getattr(ex_item, "menu_item_id", None)
            item_name = getattr(ex_item, "item_name", None) or "Exchange Item"
            selected_unit = getattr(ex_item, "selected_unit", None)

        ex_total = ex_qty * ex_price
        total_exchange_amount += ex_total

        if raw_id:
            try:
                m_item = await db.get(MenuItem, uuid.UUID(str(raw_id)))
                if m_item and m_item.name:
                    item_name = m_item.name
            except Exception:
                pass

        exchange_items_summary.append({
            "menu_item_id": str(raw_id) if raw_id else None,
            "item_name": item_name,
            "quantity": float(ex_qty),
            "unit_price": float(ex_price),
            "line_total": float(ex_total),
            "selected_unit": selected_unit,
        })

    round_off_dec = Decimal(str(getattr(data, "round_off", 0) or 0))
    net_refund_amount = (total_return_amount - total_exchange_amount) + round_off_dec
    final_refund_recorded = max(Decimal("0.00"), net_refund_amount)

    net_balance = float(net_refund_amount)
    return_num = f"RET-{uuid.uuid4().hex[:6].upper()}"

    # Create a real Order for exchange items so inventory is deducted and sales/revenue are tracked
    exchange_order = None
    if exchange_items_summary and total_exchange_amount > 0:
        exchange_basket = f"EXC-{return_num}"
        exchange_credit_offset = min(total_return_amount, total_exchange_amount)
        if total_return_amount >= total_exchange_amount:
            ex_pm = "EXCHANGE_CREDIT"
            ex_ref = f"EXCHANGE [{return_num}] (Return Credit)"
        else:
            ex_pm = data.refund_payment_method or "CASH"
            ex_ref = f"EXCHANGE [{return_num}] (Diff Paid Rs.{total_exchange_amount - total_return_amount:.2f})"

        exchange_order = Order(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            basket_number=exchange_basket,
            customer_name=customer_name,
            customer_phone=customer_phone,
            subtotal_amount=total_exchange_amount,
            total_amount=total_exchange_amount,
            credit_applied=Decimal(str(data.apply_credit or 0)),
            debit_applied=Decimal(str(data.record_debit or 0)),
            debt_settled=Decimal(str(data.debt_settled or 0)),
            credit_awarded=Decimal(str(data.record_credit or 0)),
            credit_cashed_out=Decimal(str(data.credit_cashed_out or 0)),
            tax_amount=Decimal("0.00"),
            status=OrderStatusEnum.COMPLETED,
            source="EXCHANGE",
            payment_method=ex_pm,
            payment_reference=ex_ref,
            is_auto_verified=True,
            created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
            finalized_at=utc_now(),
            paid_at=utc_now(),
        )
        db.add(exchange_order)
        await db.flush()

        for ex_s in exchange_items_summary:
            raw_m_id = ex_s.get("menu_item_id")
            m_uuid = None
            if raw_m_id and str(raw_m_id).strip() and str(raw_m_id).strip().lower() not in ("none", "null", ""):
                try:
                    m_uuid = uuid.UUID(str(raw_m_id).strip())
                except (ValueError, TypeError):
                    m_uuid = None

            m_item = await db.get(MenuItem, m_uuid) if m_uuid else None
            resolved_unit = await _resolve_item_unit(db, ex_s.get("selected_unit"), m_item)

            raw_b_id = ex_s.get("selected_batch_id")
            b_uuid = None
            if raw_b_id and str(raw_b_id).strip() and str(raw_b_id).strip().lower() not in ("none", "null", ""):
                try:
                    b_uuid = uuid.UUID(str(raw_b_id).strip())
                except (ValueError, TypeError):
                    b_uuid = None

            oi = OrderItem(
                id=uuid.uuid4(),
                order_id=exchange_order.id,
                menu_item_id=m_uuid,
                selected_batch_id=b_uuid,
                item_name=ex_s["item_name"],
                quantity=Decimal(str(ex_s["quantity"])),
                selected_unit=resolved_unit,
                unit_price=Decimal(str(ex_s["unit_price"])),
                mrp=Decimal(str(ex_s.get("mrp") or ex_s["unit_price"])),
                tax_rate=Decimal(str(m_item.tax_rate)) if m_item and m_item.tax_rate is not None else Decimal("0.00"),
                tax_category=m_item.tax_category if m_item and m_item.tax_category else "GST 0%",
                line_total=Decimal(str(ex_s["line_total"])),
            )
            db.add(oi)

        await db.flush()

        # Trigger inventory auto-deduction for the exchange order
        try:
            await process_order_auto_deduction(db, exchange_order)
        except Exception as e:
            logger.error("Failed to auto-deduct inventory for exchange order %s: %s", exchange_order.id, e, exc_info=True)
            raise

    # Process Customer Wallet (Store Credit/Debt) & Loyalty Points deduction
    customer = None
    if customer_phone:
        from app.models.customer import Customer
        from app.models.customer_ledger import CustomerLedger
        
        cust_res = await db.execute(
            select(Customer).where(
                Customer.outlet_id == outlet_id,
                Customer.phone == customer_phone
            )
        )
        customer = cust_res.scalar_one_or_none()
        if not customer and (data.apply_credit > 0 or data.record_debit > 0 or data.record_credit > 0 or data.debt_settled > 0 or data.credit_cashed_out > 0 or data.refund_payment_method == "STORE_CREDIT"):
            customer = Customer(
                outlet_id=outlet_id,
                phone=customer_phone,
                name=customer_name or "Customer",
                credit_balance=Decimal("0.00"),
                loyalty_points=0,
            )
            db.add(customer)
            await db.flush()
        
        if customer:
            # 1. Loyalty Points Deduction for Return Value
            res_rest = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
            outlet = res_rest.scalar_one_or_none()
            if outlet and getattr(outlet, "loyalty_points_per_rupee", 0) > 0 and total_return_amount > 0:
                points_to_deduct = int(float(total_return_amount) * float(outlet.loyalty_points_per_rupee))
                if points_to_deduct > 0:
                    customer.loyalty_points = max(0, (customer.loyalty_points or 0) - points_to_deduct)

            # Auto-handling when STORE_CREDIT method is selected
            if data.refund_payment_method == "STORE_CREDIT" and data.record_credit == 0 and data.debt_settled == 0:
                net_refund_val = total_return_amount
                if customer.credit_balance < 0:
                    cur_debt = abs(customer.credit_balance)
                    if net_refund_val <= cur_debt:
                        data.debt_settled = net_refund_val
                    else:
                        data.debt_settled = cur_debt
                        data.record_credit = net_refund_val - cur_debt
                else:
                    data.record_credit = net_refund_val

            # 2. Process Ledger Operations
            ledger_entries = []
            
            if data.apply_credit > 0:
                customer.credit_balance -= data.apply_credit
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        order_id=order.id if order else None,
                        created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
                        entry_type="CREDIT_APPLIED",
                        amount=data.apply_credit,
                        balance_after=customer.credit_balance,
                        note=f"Store credit applied to return/exchange {return_num}"
                    )
                )
            if data.credit_cashed_out > 0:
                customer.credit_balance -= data.credit_cashed_out
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        order_id=order.id if order else None,
                        created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
                        entry_type="CREDIT_USED",
                        amount=data.credit_cashed_out,
                        balance_after=customer.credit_balance,
                        note=f"Store credit cashed out during return {return_num}"
                    )
                )
            if data.debt_settled > 0:
                customer.credit_balance += data.debt_settled
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        order_id=order.id if order else None,
                        created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
                        entry_type="DEBIT_SETTLED",
                        amount=data.debt_settled,
                        balance_after=customer.credit_balance,
                        note=f"Debt settled during return/exchange {return_num}"
                    )
                )
            if data.record_credit > 0:
                customer.credit_balance += data.record_credit
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        order_id=order.id if order else None,
                        created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
                        entry_type="CREDIT_ADDED",
                        amount=data.record_credit,
                        balance_after=customer.credit_balance,
                        note=f"Store credit added for return {return_num}"
                    )
                )
            if data.record_debit > 0:
                customer.credit_balance -= data.record_debit
                ledger_entries.append(
                    CustomerLedger(
                        outlet_id=outlet_id,
                        customer_id=customer.id,
                        order_id=order.id if order else None,
                        created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
                        entry_type="DEBIT_ADDED",
                        amount=data.record_debit,
                        balance_after=customer.credit_balance,
                        note=f"Shortfall / extra change recorded as Debt {return_num}"
                    )
                )
            db.add_all(ledger_entries)

    notes_parts = [data.notes] if data.notes else []
    if total_exchange_amount > 0:
        notes_parts.append(f"Exchange: {len(exchange_items_summary)} item(s) (Rs.{total_exchange_amount:.2f})")
    if round_off_dec != 0:
        notes_parts.append(f"Round Off: {round_off_dec:+.2f}")
    final_notes = " | ".join(notes_parts) if notes_parts else None

    # Save to CustomerReturn table
    customer_return_rec = CustomerReturn(
        return_number=return_num,
        outlet_id=outlet_id,
        order_id=order.id if order else None,
        customer_name=customer_name,
        customer_phone=customer_phone,
        returned_items=returned_items_summary,
        exchange_items=exchange_items_summary,
        gross_return_amount=total_return_amount,
        total_refund_amount=final_refund_recorded,
        total_exchange_amount=total_exchange_amount,
        exchange_order_id=exchange_order.id if exchange_order else None,
        refund_payment_method=data.refund_payment_method or "CASH",
        notes=final_notes if 'final_notes' in locals() else data.notes,
        credit_applied=data.apply_credit,
        debit_applied=data.record_debit,
        debt_settled=data.debt_settled,
        credit_awarded=data.record_credit,
        credit_cashed_out=data.credit_cashed_out,
        customer_balance=customer.credit_balance if customer else None,
        created_by_staff_id=_get_user_id(staff_user) if staff_user else None,
    )
    db.add(customer_return_rec)
    
    # If cash refund denominations are provided, log a drawer transaction
    if data.refund_payment_method == "CASH" and (data.refund_cash_denominations or data.inward_cash_denominations):
        from app.models.cash_drawer_ledger import CashDrawerLedger
        net_denoms = {}
        
        # Inward cash (positive)
        if data.inward_cash_denominations:
            for k, v in data.inward_cash_denominations.items():
                if v > 0:
                    net_denoms[k] = net_denoms.get(k, 0) + v
                    
        # Outward cash (refund, negative)
        if data.refund_cash_denominations:
            for k, v in data.refund_cash_denominations.items():
                if v > 0:
                    net_denoms[k] = net_denoms.get(k, 0) - v
                    
        # Filter out 0 net changes
        net_denoms = {str(k): int(v) for k, v in net_denoms.items() if v != 0}
        
        if net_denoms:
            refund_tx = CashDrawerLedger(
                outlet_id=outlet_id,
                transaction_type="CUSTOMER_RETURN",
                denominations=net_denoms,
                reference_order_id=order.id if order else None,
                notes=f"Refund exchange for return {return_num}",
                created_by=_get_user_id(staff_user)
            )
            db.add(refund_tx)
    
    # OUTBOX: Queue action for cloud sync if local
    append_to_outbox(
        db,
        action_type="customer_return",
        payload={
            "staff_id": str(_get_user_id(staff_user)) if _get_user_id(staff_user) else None,
            "return_data": data.model_dump(mode="json"),
        }
    )

    await db.flush()
    await db.commit()

    try:
        from app.services.websocket_service import broadcast_catalog_updated
        await broadcast_catalog_updated(outlet_id, reason="CUSTOMER_RETURN", item_id=str(customer_return_rec.id))
    except Exception as e:
        logger.warning("Failed to broadcast catalog update on customer return: %s", e)

    res_outlet = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet_obj = res_outlet.scalar_one_or_none()

    if order:
        is_interstate = bool(order.is_interstate)
        place_of_supply = order.place_of_supply or (outlet_obj.place_of_supply if outlet_obj else None)
    else:
        is_interstate = bool(getattr(data, "is_interstate", False)) or (
            (outlet_obj.interstate_mode == "ALWAYS_ON") if outlet_obj else False
        )
        place_of_supply = getattr(data, "place_of_supply", None) or (
            outlet_obj.place_of_supply if outlet_obj else None
        )

    return {
        "id": str(customer_return_rec.id),
        "status": "PROCESSED",
        "return_number": return_num,
        "order_id": str(order.id) if order else None,
        "original_bill_number": original_bill_number or "Direct Return (No Bill)",
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "gross_return_amount": float(total_return_amount),
        "total_refund_amount": float(final_refund_recorded),
        "total_exchange_amount": float(total_exchange_amount),
        "exchange_order_id": str(exchange_order.id) if exchange_order else None,
        "net_balance": net_balance,
        "round_off": float(round_off_dec),
        "returned_items": returned_items_summary,
        "exchange_items": exchange_items_summary,
        "refund_payment_method": data.refund_payment_method or "CASH",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "credit_applied": float(data.apply_credit or 0),
        "credit_cashed_out": float(data.credit_cashed_out or 0),
        "debt_settled": float(data.debt_settled or 0),
        "credit_awarded": float(data.record_credit or 0),
        "debit_applied": float(data.record_debit or 0),
        "customer_balance": float(customer.credit_balance) if customer else None,
        "wallet_balance_after": float(customer.credit_balance) if customer else None,
        "is_interstate": is_interstate,
        "place_of_supply": place_of_supply,
    }


async def list_customer_returns(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    start_date: str | None = None,
    end_date: str | None = None,
    min_created_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """List all past customer return bills for an outlet with optional date filtering and shift minimum bound."""
    stmt = (
        select(CustomerReturn)
        .options(
            selectinload(CustomerReturn.order),
            selectinload(CustomerReturn.outlet),
        )
        .where(CustomerReturn.outlet_id == outlet_id)
    )

    if min_created_at:
        stmt = stmt.where(CustomerReturn.created_at >= min_created_at)

    if start_date and end_date:
        try:
            from datetime import datetime, time, timedelta
            from app.core.datetime_utils import ensure_naive_utc
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(dt_start, time.min) - timedelta(hours=5, minutes=30))
            end_utc = ensure_naive_utc(datetime.combine(dt_end, time.max) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(CustomerReturn.created_at.between(start_utc, end_utc))
        except ValueError:
            pass
    elif start_date:
        try:
            from datetime import datetime, time, timedelta
            from app.core.datetime_utils import ensure_naive_utc
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(dt_start, time.min) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(CustomerReturn.created_at >= start_utc)
        except ValueError:
            pass
    elif end_date:
        try:
            from datetime import datetime, time, timedelta
            from app.core.datetime_utils import ensure_naive_utc
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            end_utc = ensure_naive_utc(datetime.combine(dt_end, time.max) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(CustomerReturn.created_at <= end_utc)
        except ValueError:
            pass

    stmt = stmt.order_by(CustomerReturn.created_at.desc())
    res = await db.execute(stmt)
    returns_list = res.scalars().all()
    out = []
    for ret in returns_list:
        orig_bill = f"#{ret.order.id.hex[:8].upper()}" if ret.order else "Direct Return (No Bill)"
        is_interstate = bool(ret.order.is_interstate) if ret.order else (
            (ret.outlet.interstate_mode == "ALWAYS_ON") if ret.outlet else False
        )
        place_of_supply = (ret.order.place_of_supply if ret.order else None) or (
            ret.outlet.place_of_supply if ret.outlet else None
        )
        out.append({
            "id": str(ret.id),
            "return_number": ret.return_number,
            "order_id": str(ret.order_id) if ret.order_id else None,
            "original_bill_number": orig_bill,
            "customer_name": ret.customer_name,
            "customer_phone": ret.customer_phone,
            "returned_items": ret.returned_items,
            "exchange_items": getattr(ret, "exchange_items", []) or [],
            "gross_return_amount": float(getattr(ret, "gross_return_amount", None) or (ret.total_refund_amount + (getattr(ret, "total_exchange_amount", 0) or 0))),
            "total_refund_amount": float(ret.total_refund_amount),
            "total_exchange_amount": float(getattr(ret, "total_exchange_amount", 0) or 0),
            "exchange_order_id": str(ret.exchange_order_id) if getattr(ret, "exchange_order_id", None) else None,
            "net_balance": float(ret.total_refund_amount),
            "refund_payment_method": ret.refund_payment_method,
            "notes": ret.notes,
            "created_at": ret.created_at.isoformat() if ret.created_at else datetime.now(timezone.utc).isoformat(),
            "credit_applied": float(getattr(ret, "credit_applied", 0) or 0),
            "debit_applied": float(getattr(ret, "debit_applied", 0) or 0),
            "debt_settled": float(getattr(ret, "debt_settled", 0) or 0),
            "credit_awarded": float(getattr(ret, "credit_awarded", 0) or 0),
            "credit_cashed_out": float(getattr(ret, "credit_cashed_out", 0) or 0),
            "customer_balance": float(ret.customer_balance) if getattr(ret, "customer_balance", None) is not None else None,
            "is_interstate": is_interstate,
            "place_of_supply": place_of_supply,
        })
    return out


async def discard_draft_bill(db: AsyncSession, bill_id: uuid.UUID, outlet_id: uuid.UUID) -> None:
    """Discard/delete a draft or pending bill when canceled without explicitly saving as draft."""
    res = await db.execute(
        select(Order).where(Order.id == bill_id, Order.outlet_id == outlet_id)
    )
    order = res.scalar_one_or_none()
    if order and order.status not in [OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, "PAID", "COMPLETED"]:
        # Delete any pending discount approvals first to avoid FK constraint error
        await db.execute(
            delete(BillDiscountApproval).where(BillDiscountApproval.order_id == order.id)
        )
        await db.delete(order)
        await db.flush()


async def delete_manual_bill(db: AsyncSession, bill_id: uuid.UUID, outlet_id: uuid.UUID, staff_user: Any) -> None:
    """Explicitly delete a bill and log the action. Only allowed for non-completed/paid bills."""
    res = await db.execute(
        select(Order).where(Order.id == bill_id, Order.outlet_id == outlet_id)
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    if order.status in [OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, OrderStatusEnum.PARTIALLY_REFUNDED, OrderStatusEnum.REFUNDED]:
        raise HTTPException(status_code=400, detail="Cannot delete a paid, completed, partially refunded, or refunded bill.")

    # Delete any pending discount approvals first
    await db.execute(
        delete(BillDiscountApproval).where(BillDiscountApproval.order_id == order.id)
    )
    
    # Log the action
    from app.services.staff_service import create_staff_audit_log
    await create_staff_audit_log(
        db=db,
        outlet_id=outlet_id,
        staff_id=_get_user_id(staff_user),
        action_type="bill_deleted",
        reference_type="Order",
        reference_id=str(order.id),
        details=f"Deleted manual bill {order.basket_number}. Status was {order.status.value}. Amount: {order.total_amount}"
    )

    # Sync action to outbox
    append_to_outbox(
        db=db,
        action_type="bill_deleted",
        payload={
            "bill_id": str(order.id),
            "basket_number": order.basket_number,
            "deleted_by": str(_get_user_id(staff_user))
        }
    )

    await db.delete(order)
    await db.flush()


async def get_item_level_return_ledger(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_date: datetime | str | None = None,
    to_date: datetime | str | None = None,
    search: str | None = None,
    reason: str | None = None,
    menu_item_id: str | uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 50,
    export_format: str | None = None,
    min_created_at: datetime | None = None,
) -> ItemReturnLedgerResponse | str:
    """
    Item-level transactional ledger of returned items for an outlet.
    Unrolls customer_returns.returned_items and returns rich row-level audit entries
    with financial metrics, search, filtering, pagination, and CSV export.
    """
    from_dt: datetime | None = None
    to_dt: datetime | None = None

    if from_date:
        if isinstance(from_date, datetime):
            from_dt = ensure_naive_utc(from_date)
        elif isinstance(from_date, str) and from_date.strip():
            s = from_date.strip()
            try:
                if len(s) == 10 and s.count("-") == 2:
                    from datetime import datetime as dt_cls, time as time_cls, timedelta as td_cls
                    d_obj = dt_cls.strptime(s, "%Y-%m-%d").date()
                    from_dt = ensure_naive_utc(dt_cls.combine(d_obj, time_cls.min) - td_cls(hours=5, minutes=30))
                else:
                    parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
                    from_dt = ensure_naive_utc(parsed)
            except Exception:
                pass

    if to_date:
        if isinstance(to_date, datetime):
            to_dt = ensure_naive_utc(to_date)
        elif isinstance(to_date, str) and to_date.strip():
            s = to_date.strip()
            try:
                if len(s) == 10 and s.count("-") == 2:
                    from datetime import datetime as dt_cls, time as time_cls, timedelta as td_cls
                    d_obj = dt_cls.strptime(s, "%Y-%m-%d").date()
                    to_dt = ensure_naive_utc(dt_cls.combine(d_obj, time_cls.max) - td_cls(hours=5, minutes=30))
                else:
                    parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
                    to_dt = ensure_naive_utc(parsed)
            except Exception:
                pass

    stmt = (
        select(CustomerReturn)
        .options(
            selectinload(CustomerReturn.order),
            selectinload(CustomerReturn.outlet),
        )
        .where(CustomerReturn.outlet_id == outlet_id)
    )

    if min_created_at is not None:
        stmt = stmt.where(CustomerReturn.created_at >= min_created_at)

    if from_dt is not None:
        stmt = stmt.where(CustomerReturn.created_at >= from_dt)
    if to_dt is not None:
        stmt = stmt.where(CustomerReturn.created_at <= to_dt)

    stmt = stmt.order_by(CustomerReturn.created_at.desc())
    res = await db.execute(stmt)
    returns_list = res.scalars().all()

    # Pre-fetch referenced MenuItem and Category info
    all_menu_item_ids: set[uuid.UUID] = set()
    for ret in returns_list:
        ritems = ret.returned_items if isinstance(ret.returned_items, list) else []
        for it in ritems:
            mid = it.get("menu_item_id")
            if mid:
                try:
                    all_menu_item_ids.add(uuid.UUID(str(mid)))
                except Exception:
                    pass

    menu_items_map: dict[str, MenuItem] = {}
    if all_menu_item_ids:
        m_res = await db.execute(
            select(MenuItem)
            .options(selectinload(MenuItem.category))
            .where(MenuItem.id.in_(all_menu_item_ids))
        )
        for m in m_res.scalars().all():
            menu_items_map[str(m.id)] = m

    all_rows: list[ItemReturnLedgerRow] = []

    for ret in returns_list:
        ritems = ret.returned_items if isinstance(ret.returned_items, list) else []
        if ret.order:
            orig_bill = f"#{ret.order.basket_number}" if ret.order.basket_number else f"#{ret.order.id.hex[:8].upper()}"
        else:
            orig_bill = "Direct Return (No Bill)"

        c_name = ret.customer_name or (ret.order.customer_name if ret.order else None)
        c_phone = ret.customer_phone or (ret.order.customer_phone if ret.order else None)
        ret_date_str = ret.created_at.isoformat() if hasattr(ret.created_at, "isoformat") else str(ret.created_at)
        is_exc = bool(ret.exchange_order_id or (getattr(ret, "exchange_items", None) and len(ret.exchange_items) > 0))

        for idx, it in enumerate(ritems):
            m_id_str = str(it.get("menu_item_id")) if it.get("menu_item_id") else None
            m_obj = menu_items_map.get(m_id_str) if m_id_str else None

            cat_name = m_obj.category.name if (m_obj and m_obj.category) else None
            barcode = getattr(m_obj, "barcode", None) if m_obj else None

            qty = float(it.get("quantity", 0) or 0)
            unit_p = float(it.get("unit_price", 0) or 0)
            mrp_val = float(it.get("mrp", 0) or 0) if it.get("mrp") is not None else (float(m_obj.mrp) if m_obj and m_obj.mrp else unit_p)
            line_ref = float(it.get("line_refund", 0) or 0) if it.get("line_refund") is not None else round(qty * unit_p, 2)

            item_reason = it.get("reason") or "CUSTOMER_RETURN"
            item_name = it.get("item_name") or (m_obj.name if m_obj else "Unknown Item")
            selected_unit = it.get("selected_unit") or (getattr(m_obj, "unit_label", None) if m_obj else "pc")

            tax_rate = float(it.get("tax_rate", 0) or 0) if it.get("tax_rate") is not None else (float(m_obj.tax_rate) if m_obj and m_obj.tax_rate else 0.0)
            tax_cat = it.get("tax_category") or (getattr(m_obj, "tax_category", None) if m_obj else "GST 0%")
            hsn = it.get("hsn_code") or (getattr(m_obj, "hsn_code", None) if m_obj else None)

            all_rows.append(
                ItemReturnLedgerRow(
                    id=f"{ret.id}_{idx}",
                    return_id=str(ret.id),
                    return_number=ret.return_number or "",
                    return_date=ret_date_str,
                    order_id=str(ret.order_id) if ret.order_id else None,
                    original_bill_number=orig_bill,
                    customer_name=c_name,
                    customer_phone=c_phone,
                    item_name=item_name,
                    menu_item_id=m_id_str,
                    category_name=cat_name,
                    barcode=barcode,
                    quantity=round(qty, 3),
                    selected_unit=selected_unit,
                    unit_price=round(unit_p, 2),
                    mrp=round(mrp_val, 2) if mrp_val else None,
                    line_refund=round(line_ref, 2),
                    tax_rate=round(tax_rate, 2),
                    tax_category=tax_cat,
                    hsn_code=hsn,
                    reason=item_reason,
                    refund_payment_method=ret.refund_payment_method or "CASH",
                    staff_name=None,
                    is_exchange=is_exc,
                )
            )

    # Apply filters
    filtered_rows = all_rows

    if menu_item_id:
        mid_str = str(menu_item_id).strip()
        filtered_rows = [r for r in filtered_rows if r.menu_item_id == mid_str]

    if reason and reason.strip() and reason.strip() != "ALL":
        q_reason = reason.strip().upper()
        filtered_rows = [r for r in filtered_rows if (r.reason or "").upper() == q_reason]

    if search and search.strip():
        q = search.strip().lower()
        filtered_rows = [
            r for r in filtered_rows
            if (
                q in (r.item_name or "").lower()
                or (r.barcode and q in r.barcode.lower())
                or (r.customer_name and q in r.customer_name.lower())
                or (r.customer_phone and q in r.customer_phone.lower())
                or (r.return_number and q in r.return_number.lower())
                or (r.original_bill_number and q in r.original_bill_number.lower())
                or (r.category_name and q in r.category_name.lower())
            )
        ]

    # Calculate summary metrics over filtered rows
    total_line_items = len(filtered_rows)
    total_qty = round(sum(r.quantity for r in filtered_rows), 3)
    total_refund = round(sum(r.line_refund for r in filtered_rows), 2)
    unique_bills = len(set(r.original_bill_number for r in filtered_rows if r.order_id))

    summary = ItemReturnLedgerSummary(
        total_line_items=total_line_items,
        total_quantity_returned=total_qty,
        total_refund_amount=total_refund,
        unique_bills_count=unique_bills,
    )

    # CSV Export support
    if export_format and export_format.lower() == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Return Number",
            "Return Date",
            "Original Bill",
            "Customer Name",
            "Customer Phone",
            "Item Name",
            "Category",
            "Barcode",
            "Quantity",
            "Unit",
            "Unit Price",
            "MRP",
            "Line Refund (INR)",
            "Reason",
            "Payment Method",
            "Is Exchange"
        ])
        for r in filtered_rows:
            # Clean ISO date to 'YYYY-MM-DD HH:mm:ss'
            dt_clean = r.return_date.replace("T", " ")[:19] if r.return_date else ""
            # Format phone and barcode as text formula to prevent scientific notation in Excel (e.g. 6.2E+09)
            phone_val = f'="{r.customer_phone}"' if r.customer_phone else ""
            barcode_val = f'="{r.barcode}"' if r.barcode else ""
            writer.writerow([
                r.return_number,
                dt_clean,
                r.original_bill_number,
                r.customer_name or "Walk-in",
                phone_val,
                r.item_name,
                r.category_name or "",
                barcode_val,
                r.quantity,
                r.selected_unit or "",
                f"{r.unit_price:.2f}",
                f"{r.mrp:.2f}" if r.mrp is not None else "",
                f"{r.line_refund:.2f}",
                r.reason,
                r.refund_payment_method,
                "YES" if r.is_exchange else "NO"
            ])
        return output.getvalue()

    # Pagination
    p = max(1, page)
    ps = max(1, min(200, page_size))
    start = (p - 1) * ps
    end = start + ps
    paged_items = filtered_rows[start:end]

    return ItemReturnLedgerResponse(
        summary=summary,
        items=paged_items,
        total_count=total_line_items,
        page=p,
        page_size=ps,
    )


async def get_consolidated_reconciliation_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Calculate executive consolidated day settlement and returns reconciliation:
    1. POS Counter Billing metrics (Gross counter sales, Cash tender, UPI tender, credit-debit, loyalty).
    2. Customer Returns & Exchanges metrics (Gross returns, Exchange value, Cash refund, UPI refund, credit-debit).
    3. Consolidated store reconciliation (Net sales retained, Cash Tender (Total), UPI Tender (Total), Total Realized Tender).
    """
    from datetime import datetime, time, timedelta
    from app.core.datetime_utils import ensure_naive_utc

    start_utc = None
    end_utc = None
    if start_date and end_date:
        try:
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(dt_start, time.min) - timedelta(hours=5, minutes=30))
            end_utc = ensure_naive_utc(datetime.combine(dt_end, time.max) - timedelta(hours=5, minutes=30))
        except ValueError:
            pass
    elif start_date:
        try:
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(dt_start, time.min) - timedelta(hours=5, minutes=30))
        except ValueError:
            pass
    elif end_date:
        try:
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            end_utc = ensure_naive_utc(datetime.combine(dt_end, time.max) - timedelta(hours=5, minutes=30))
        except ValueError:
            pass

    # 1. Fetch Settled Counter Bills (Exclude VOID orders and EXCHANGE orders generated by returns desk)
    order_stmt = (
        select(Order)
        .where(
            Order.outlet_id == outlet_id,
            Order.is_void == False,
            or_(Order.source.is_(None), Order.source != "EXCHANGE"),
            Order.status.in_([
                OrderStatusEnum.PAID,
                OrderStatusEnum.COMPLETED,
                "PAID",
                "COMPLETED",
                "SERVED",
                "FINALIZED",
                "PARTIALLY_REFUNDED",
                "REFUNDED",
            ]),
        )
    )
    if start_utc and end_utc:
        order_stmt = order_stmt.where(Order.created_at.between(start_utc, end_utc))
    elif start_utc:
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
    elif end_utc:
        order_stmt = order_stmt.where(Order.created_at <= end_utc)

    order_res = await db.execute(order_stmt)
    orders = order_res.scalars().all()

    # 2. Fetch Customer Return Vouchers
    ret_stmt = select(CustomerReturn).where(CustomerReturn.outlet_id == outlet_id)
    if start_utc and end_utc:
        ret_stmt = ret_stmt.where(CustomerReturn.created_at.between(start_utc, end_utc))
    elif start_utc:
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif end_utc:
        ret_stmt = ret_stmt.where(CustomerReturn.created_at <= end_utc)

    ret_res = await db.execute(ret_stmt)
    customer_returns = ret_res.scalars().all()

    # Compute POS Counter Metrics
    counter_gross_sales = Decimal("0.00")
    counter_upi_tender = Decimal("0.00")
    counter_credit_applied = Decimal("0.00")
    counter_debit_applied = Decimal("0.00")
    counter_debt_settled = Decimal("0.00")
    counter_credit_awarded = Decimal("0.00")
    counter_credit_cashed_out = Decimal("0.00")
    counter_loyalty_redeemed = Decimal("0.00")
    counter_net_paid = Decimal("0.00")
    counter_bills_count = len(orders)

    for b in orders:
        bill_total = Decimal(str(b.total_amount or 0))
        counter_gross_sales += bill_total

        c_app = Decimal(str(b.credit_applied or 0))
        d_app = Decimal(str(b.debit_applied or 0))
        d_set = Decimal(str(b.debt_settled or 0))
        c_awa = Decimal(str(b.credit_awarded or 0))
        c_cash = Decimal(str(b.credit_cashed_out or 0))
        l_red = Decimal(str(getattr(b, "loyalty_discount_inr", 0) or 0))

        counter_credit_applied += c_app
        counter_debit_applied += d_app
        counter_debt_settled += d_set
        counter_credit_awarded += c_awa
        counter_credit_cashed_out += c_cash
        counter_loyalty_redeemed += l_red

        net = bill_total - l_red - c_app - d_app + d_set + c_awa - c_cash
        counter_net_paid += net

        explicit_upi = Decimal(str(getattr(b, "upi_amount", 0) or 0))
        pm = (b.payment_method or "").upper()
        order_upi = Decimal("0.00")
        if pm == "UPI":
            order_upi = max(Decimal("0.00"), net)
        elif pm == "SPLIT" and explicit_upi > 0:
            order_upi = min(explicit_upi, max(Decimal("0.00"), net))
        elif explicit_upi > 0:
            order_upi = min(explicit_upi, max(Decimal("0.00"), net))

        counter_upi_tender += order_upi

    counter_credit_debit_net = (
        counter_debt_settled + counter_credit_awarded
        - counter_credit_applied - counter_debit_applied - counter_credit_cashed_out
    )
    counter_cash_tender = counter_net_paid - counter_upi_tender

    # Compute Returns Desk Metrics
    returns_gross_amount = Decimal("0.00")
    returns_exchange_value = Decimal("0.00")
    returns_net_refund = Decimal("0.00")
    returns_cash_refund = Decimal("0.00")
    returns_upi_refund = Decimal("0.00")
    returns_credit_applied = Decimal("0.00")
    returns_debit_applied = Decimal("0.00")
    returns_debt_settled = Decimal("0.00")
    returns_credit_awarded = Decimal("0.00")
    returns_credit_cashed_out = Decimal("0.00")
    returns_count = len(customer_returns)

    for ret in customer_returns:
        g_ret = Decimal(str(getattr(ret, "gross_return_amount", None) or (ret.total_refund_amount + (getattr(ret, "total_exchange_amount", 0) or 0))))
        ex_val = Decimal(str(getattr(ret, "total_exchange_amount", 0) or 0))
        net_bal = g_ret - ex_val
        returns_gross_amount += g_ret
        returns_exchange_value += ex_val
        returns_net_refund += net_bal

        c_app = Decimal(str(getattr(ret, "credit_applied", 0) or 0))
        d_app = Decimal(str(getattr(ret, "debit_applied", 0) or 0))
        d_set = Decimal(str(getattr(ret, "debt_settled", 0) or 0))
        c_awa = Decimal(str(getattr(ret, "credit_awarded", 0) or 0))
        c_cash = Decimal(str(getattr(ret, "credit_cashed_out", 0) or 0))

        returns_credit_applied += c_app
        returns_debit_applied += d_app
        returns_debt_settled += d_set
        returns_credit_awarded += c_awa
        returns_credit_cashed_out += c_cash

        ret_cd = d_set + c_awa - c_app - d_app - c_cash
        outward_refund = net_bal - ret_cd
        pm = (ret.refund_payment_method or "CASH").upper()
        if pm == "UPI":
            returns_upi_refund += outward_refund
        else:
            returns_cash_refund += outward_refund

    returns_credit_debit_net = (
        returns_debt_settled + returns_credit_awarded
        - returns_credit_applied - returns_debit_applied - returns_credit_cashed_out
    )

    # Consolidated Calculations
    consolidated_net_sales = counter_gross_sales - (returns_gross_amount - returns_exchange_value)
    cash_tender_total = counter_cash_tender - returns_cash_refund
    upi_tender_total = counter_upi_tender - returns_upi_refund
    total_tender = cash_tender_total + upi_tender_total
    consolidated_credit_debit_net = counter_credit_debit_net + returns_credit_debit_net
    consolidated_loyalty_redeemed = counter_loyalty_redeemed
    consolidated_net_settlement = total_tender

    return {
        "start_date": start_date,
        "end_date": end_date,
        "counter_gross_sales": float(round(counter_gross_sales, 2)),
        "counter_cash_tender": float(round(counter_cash_tender, 2)),
        "counter_upi_tender": float(round(counter_upi_tender, 2)),
        "counter_credit_applied": float(round(counter_credit_applied, 2)),
        "counter_debit_applied": float(round(counter_debit_applied, 2)),
        "counter_debt_settled": float(round(counter_debt_settled, 2)),
        "counter_credit_awarded": float(round(counter_credit_awarded, 2)),
        "counter_credit_cashed_out": float(round(counter_credit_cashed_out, 2)),
        "counter_credit_debit_net": float(round(counter_credit_debit_net, 2)),
        "counter_loyalty_redeemed": float(round(counter_loyalty_redeemed, 2)),
        "counter_net_paid": float(round(counter_net_paid, 2)),
        "counter_bills_count": counter_bills_count,
        "returns_gross_amount": float(round(returns_gross_amount, 2)),
        "returns_exchange_value": float(round(returns_exchange_value, 2)),
        "returns_net_refund": float(round(returns_net_refund, 2)),
        "returns_cash_refund": float(round(returns_cash_refund, 2)),
        "returns_upi_refund": float(round(returns_upi_refund, 2)),
        "returns_credit_debit_net": float(round(returns_credit_debit_net, 2)),
        "returns_count": returns_count,
        "consolidated_net_sales": float(round(consolidated_net_sales, 2)),
        "cash_tender_total": float(round(cash_tender_total, 2)),
        "upi_tender_total": float(round(upi_tender_total, 2)),
        "total_tender": float(round(total_tender, 2)),
        "consolidated_credit_debit_net": float(round(consolidated_credit_debit_net, 2)),
        "consolidated_loyalty_redeemed": float(round(consolidated_loyalty_redeemed, 2)),
        "consolidated_net_settlement": float(round(consolidated_net_settlement, 2)),
    }


def generate_reconciliation_csv(summary: dict[str, Any], outlet_name: str = "Store") -> str:
    """Generate professional CSV report of the consolidated reconciliation summary."""
    import csv
    import io
    from datetime import datetime

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["Consolidated Store Settlement & Returns Reconciliation Report"])
    writer.writerow(["Outlet", outlet_name])
    writer.writerow(["Date Range", f"{summary.get('start_date') or 'All'} to {summary.get('end_date') or 'All'}"])
    writer.writerow(["Generated At", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    writer.writerow([])

    writer.writerow(["EXECUTIVE SUMMARY", "VALUE (INR)"])
    writer.writerow(["Net Merchandise Sales Retained", f"{summary['consolidated_net_sales']:.2f}"])
    writer.writerow(["Cash Tender (Total)", f"{summary['cash_tender_total']:.2f}"])
    writer.writerow(["UPI Tender (Total)", f"{summary['upi_tender_total']:.2f}"])
    writer.writerow(["Total Realized Tender (Cash + UPI)", f"{summary['total_tender']:.2f}"])
    writer.writerow(["Net Customer Credit-Debit Adjustment", f"{summary['consolidated_credit_debit_net']:+.2f}"])
    writer.writerow(["Loyalty Points Redeemed", f"-{summary['consolidated_loyalty_redeemed']:.2f}"])
    writer.writerow(["Net Realized Settlement", f"{summary['consolidated_net_settlement']:.2f}"])
    writer.writerow([])

    writer.writerow(["DETAILED 3-WAY RECONCILIATION MATRIX"])
    writer.writerow(["Line Item / Metric", "POS Billing Counter", "Customer Returns Desk", "Consolidated Store Total"])
    writer.writerow([
        "Gross Merchandise / Exchange Sales",
        f"{summary['counter_gross_sales']:.2f}",
        f"-{summary['returns_gross_amount'] - summary['returns_exchange_value']:.2f}",
        f"{summary['consolidated_net_sales']:.2f}",
    ])
    writer.writerow([
        "Cash Tender",
        f"{summary['counter_cash_tender']:.2f}",
        f"-{summary['returns_cash_refund']:.2f}",
        f"{summary['cash_tender_total']:.2f}",
    ])
    writer.writerow([
        "UPI Tender",
        f"{summary['counter_upi_tender']:.2f}",
        f"-{summary['returns_upi_refund']:.2f}",
        f"{summary['upi_tender_total']:.2f}",
    ])
    writer.writerow([
        "Customer Credit / Debit Net",
        f"{summary['counter_credit_debit_net']:+.2f}",
        f"{summary['returns_credit_debit_net']:+.2f}",
        f"{summary['consolidated_credit_debit_net']:+.2f}",
    ])
    writer.writerow([
        "Loyalty Points Redeemed",
        f"-{summary['counter_loyalty_redeemed']:.2f}",
        "0.00",
        f"-{summary['consolidated_loyalty_redeemed']:.2f}",
    ])
    writer.writerow([
        "Total Realized Settlement",
        f"{summary['counter_net_paid']:.2f}",
        f"-{summary['returns_net_refund']:.2f}",
        f"{summary['consolidated_net_settlement']:.2f}",
    ])
    writer.writerow([
        "Total Records / Vouchers Count",
        summary["counter_bills_count"],
        summary["returns_count"],
        summary["counter_bills_count"] + summary["returns_count"],
    ])

    return output.getvalue()


