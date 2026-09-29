"""
Unit & Integration tests for Inventory Reconciliation, POS Overselling,
Online Stock Caps, and Exact Customer Return Batch Restoration.
"""

import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.enums import PaymentModeEnum, RoleEnum, StockChangeTypeEnum
from app.models.outlet import Outlet
from app.models.user import User
from app.models.inventory_item import InventoryItem
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.schemas.inventory import StockIntakeCreate
from app.schemas.order import CheckoutRequest, OrderItemRequest
from app.services.inventory_service import (
    log_stock_intake,
    process_order_auto_deduction,
    restore_customer_return_to_batch,
)
from app.services.order_service import create_order, transition_order_status
from app.models.enums import OrderStatusEnum
from fastapi import HTTPException


from app.models.category import Category

@pytest.mark.asyncio
async def test_online_stock_cap_and_pos_oversell_reconciliation(db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Test Reconciliation Outlet",
        slug=f"recon-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    category = Category(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Fruits",
        display_order=1,
    )
    db.add(category)

    # Inventory Item with initial stock = 2.0 kg
    item_id = uuid.uuid4()
    item = InventoryItem(
        id=item_id,
        outlet_id=outlet_id,
        name="Fresh Organic Apple",
        category="Fruits",
        unit="kg",
        current_stock=Decimal("2.000"),
        cost_per_unit=Decimal("100.00"),
        mrp=Decimal("150.00"),
    )
    db.add(item)

    # Initial Batch 1 = 2.0 kg
    batch1 = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item_id,
        batch_number="BAT-APPLE-001",
        quantity=Decimal("2.000"),
        initial_quantity=Decimal("2.000"),
        remaining_quantity=Decimal("2.000"),
        unit_cost=Decimal("100.00"),
    )
    db.add(batch1)

    # Linked MenuItem
    menu_item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=category.id,
        inventory_item_id=item_id,
        name="Fresh Organic Apple",
        price=Decimal("150.00"),
        is_available=True,
    )
    db.add(menu_item)
    await db.commit()

    # 1. Test Web/Mobile Online Stock Cap Rejection
    checkout_req = CheckoutRequest(
        outlet_slug=outlet.slug,
        basket_number="1",
        items=[OrderItemRequest(menu_item_id=menu_item.id, quantity=Decimal("5.000"))],
        customer_name="Online Customer",
    )
    with pytest.raises(HTTPException) as exc_info:
        await create_order(db, checkout_req)
    assert exc_info.value.status_code == 400
    assert "remaining in stock" in exc_info.value.detail

    # 2. Test POS Oversell (Staff Checkout allowing 5.0 kg when stock is 2.0 kg)
    pos_item_req = OrderItemRequest(
        menu_item_id=menu_item.id,
        quantity=Decimal("5.000"),
        added_by_staff_id=uuid.uuid4(),
    )
    pos_checkout = CheckoutRequest(
        outlet_slug=outlet.slug,
        basket_number="1",
        items=[pos_item_req],
        customer_name="POS Customer",
    )
    pos_order = await create_order(db, pos_checkout)
    await transition_order_status(db, pos_order, OrderStatusEnum.PAID)

    # Verify item.current_stock is now negative (-3.0 kg) and batch1 remaining is 0
    await db.refresh(item)
    await db.refresh(batch1)
    assert float(item.current_stock) == -3.0
    assert float(batch1.remaining_quantity) == 0.0

    # 3. Test New Batch Auto-Reconciliation
    # Admin adds Batch 2 of 50.0 kg @ unit cost 110.00
    new_intake_data = StockIntakeCreate(
        item_id=item_id,
        batch_number="BAT-APPLE-002",
        quantity=Decimal("50.000"),
        unit_cost=Decimal("110.00"),
    )
    batch2 = await log_stock_intake(db, outlet_id, None, new_intake_data)
    await db.commit()

    await db.refresh(item)
    await db.refresh(batch2)

    # Verify batch2 absorbed 3.0 kg oversold backorder: remaining = 47.0 kg
    assert float(batch2.remaining_quantity) == 47.0
    # Total current stock = 47.0 kg (-3 + 50)
    assert float(item.current_stock) == 47.0


@pytest.mark.asyncio
async def test_exact_batch_restoration_on_customer_return(db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Test Return Batch Outlet",
        slug=f"ret-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    item_id = uuid.uuid4()
    item = InventoryItem(
        id=item_id,
        outlet_id=outlet_id,
        name="Organic Guava",
        category="Fruits",
        unit="kg",
        current_stock=Decimal("10.000"),
        cost_per_unit=Decimal("40.00"),
    )
    db.add(item)

    # Batch A = 10.0 kg
    batch_a = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item_id,
        batch_number="BAT-GUAVA-A",
        quantity=Decimal("10.000"),
        initial_quantity=Decimal("10.000"),
        remaining_quantity=Decimal("10.000"),
        unit_cost=Decimal("40.00"),
    )
    db.add(batch_a)

    category = Category(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Fruits",
        display_order=1,
    )
    db.add(category)

    menu_item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=category.id,
        inventory_item_id=item_id,
        name="Organic Guava",
        price=Decimal("60.00"),
        is_available=True,
    )
    db.add(menu_item)
    await db.commit()

    # Place & Pay order for 4.0 kg
    pos_checkout = CheckoutRequest(
        outlet_slug=outlet.slug,
        basket_number="1",
        items=[OrderItemRequest(menu_item_id=menu_item.id, quantity=Decimal("4.000"), added_by_staff_id=uuid.uuid4())],
        customer_name="Return Test Customer",
    )
    order = await create_order(db, pos_checkout)
    await transition_order_status(db, order, OrderStatusEnum.PAID)

    await db.refresh(batch_a)
    await db.refresh(item)
    assert float(batch_a.remaining_quantity) == 6.0
    assert float(item.current_stock) == 6.0

    # Customer Returns 2.0 kg from this order
    await restore_customer_return_to_batch(
        db=db,
        outlet_id=outlet_id,
        item_id=item_id,
        return_qty=Decimal("2.000"),
        order_id=order.id,
    )
    await db.commit()

    await db.refresh(batch_a)
    await db.refresh(item)

    # Verify Batch A remaining_quantity restored directly from 6.0 -> 8.0 kg!
    assert float(batch_a.remaining_quantity) == 8.0
    # Total current stock = 8.0 kg (100% sync)
    assert float(item.current_stock) == 8.0
