"""
Unit and integration tests for the Inventory & Stock Summary Report.
Validates the mathematical closed-loop reconciliation bridge:
Opening Stock + Net Supplier Spend - COGS - Wastage +/- Audit Adjustments == Closing Stock Value.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import OrderStatusEnum, PaymentModeEnum, RoleEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.purchase_return import PurchaseReturn
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.user import User
from app.services.analytics_service import get_inventory_summary_report


@pytest.mark.asyncio
async def test_inventory_summary_reconciliation_bridge_balanced(db_session: AsyncSession):
    """
    Test that Opening Stock + Net Inward - COGS - Wastage + Adjustments == Closing Stock.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Summary Test Outlet",
        slug=f"sum-out-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    # 1. Create inventory item
    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Organic Basmati Rice 1kg",
        unit="pcs",
        current_stock=Decimal("80.000"),
        cost_per_unit=Decimal("100.00"),
        retail_price=Decimal("150.00"),
    )
    db.add(item)

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(days=1)
    to_dt = now + timedelta(hours=1)

    # 2. Inward intake batch: 100 units @ 100 = 10,000 gross spend
    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number="BAT-RICE-001",
        quantity=Decimal("100.000"),
        initial_quantity=Decimal("100.000"),
        remaining_quantity=Decimal("80.000"),
        unit_cost=Decimal("100.00"),
        intake_date=now - timedelta(hours=12),
    )
    db.add(intake)

    # 3. Purchase return: 5 units @ 100 = 500 refund
    pr = PurchaseReturn(
        id=uuid.uuid4(),
        return_number=f"PR-{uuid.uuid4().hex[:6]}",
        outlet_id=outlet_id,
        item_id=item.id,
        supplier_name="Agro Supplier",
        quantity=Decimal("5.000"),
        unit_cost=Decimal("100.00"),
        total_refund_amount=Decimal("500.00"),
        created_at=now - timedelta(hours=10),
    )
    db.add(pr)

    # 4. Settled order with 10 units sold @ 150 = 1,500 gross revenue with 100 discount = 1,400 net
    order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B101",
        total_amount=Decimal("1400.00"),
        subtotal_amount=Decimal("1500.00"),
        discount_type="FLAT",
        discount_value=Decimal("100.00"),
        status=OrderStatusEnum.COMPLETED,
        is_void=False,
        created_at=now - timedelta(hours=6),
    )
    db.add(order)

    order_item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        quantity=Decimal("10.000"),
        unit_price=Decimal("150.00"),
        returned_quantity=Decimal("0.000"),
    )
    db.add(order_item)

    # COGS stock ledger deduction: 10 units @ 100 = 1,000 COGS
    cogs_ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        reference_order_id=order.id,
        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
        quantity_change=Decimal("-10.000"),
        resulting_stock=Decimal("85.000"),
        unit_cost_snapshot=Decimal("100.00"),
        created_at=now - timedelta(hours=6),
    )
    db.add(cogs_ledger)

    # 5. Wastage: 3 units spoiled @ 100 = 300 wastage cost
    wastage_ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.MANUAL_ADJUSTMENT,
        quantity_change=Decimal("-3.000"),
        resulting_stock=Decimal("82.000"),
        unit_cost_snapshot=Decimal("100.00"),
        reason="SPOILED_EXPIRED",
        created_at=now - timedelta(hours=4),
    )
    db.add(wastage_ledger)

    # 6. Physical audit adjustment: -2 units shrinkage @ 100 = -200
    adj_ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.MANUAL_ADJUSTMENT,
        quantity_change=Decimal("-2.000"),
        resulting_stock=Decimal("80.000"),
        unit_cost_snapshot=Decimal("100.00"),
        reason="AUDIT_CORRECTION",
        created_at=now - timedelta(hours=2),
    )
    db.add(adj_ledger)

    # 7. Add an oversold deficit batch (BAT-OV-...) to verify it is filtered out of spend
    ov_batch = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number="BAT-OV-18092026-AB12",
        quantity=Decimal("-5.000"),
        initial_quantity=Decimal("0.000"),
        remaining_quantity=Decimal("-5.000"),
        unit_cost=Decimal("100.00"),
        intake_date=now - timedelta(hours=1),
    )
    db.add(ov_batch)

    await db.commit()

    # Execute report
    report = await get_inventory_summary_report(db, outlet_id, from_dt, to_dt)
    rb = report.reconciliation_bridge

    # Verify Gross Inward Spend excludes BAT-OV
    assert rb.gross_inward_spend == 10000.00

    # Verify Purchase Returns
    assert rb.purchase_returns == 500.00
    assert rb.net_supplier_spend == 9500.00

    # Verify COGS
    assert rb.cost_of_goods_sold == 1000.00

    # Verify Wastage Cost
    assert rb.wastage_cost == 300.00

    # Verify Audit Adjustment
    assert rb.manual_adjustments == -200.00

    # Verify Revenue & Discounts
    assert rb.sold_inventory_revenue == 1500.00
    assert rb.customer_discounts == 100.00
    assert rb.net_sold_revenue == 1400.00

    # Verify Merchandise Margins
    assert rb.gross_merchandise_margin == 400.00  # 1,400 net rev - 1,000 COGS
    assert rb.realized_net_profit == -100.00       # 400 - 300 wastage - 200 audit adjustment

    # Verify Closing Stock Asset (80 units @ 100 = 8,000)
    assert rb.closing_stock_value == 8000.00

    # Verify Mathematical Bridge Equation Balance:
    # Opening Stock + Net Inward Spend - COGS - Wastage + Adjustments == Closing Stock
    # opening + 9500 - 1000 - 300 - 200 == 8000
    # opening + 8000 == 8000  =>  opening == 0.00
    expected_closing = rb.opening_stock_value + rb.net_supplier_spend - rb.cost_of_goods_sold - rb.wastage_cost + rb.manual_adjustments
    assert round(expected_closing, 2) == round(rb.closing_stock_value, 2)


@pytest.mark.asyncio
async def test_zero_procurement_day_bridge(db_session: AsyncSession):
    """
    Verify that on a day with 0 purchases, opening stock correctly absorbs COGS and wastage,
    and the bridge equation remains completely balanced.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Zero Procurement Test Outlet",
        slug=f"zero-proc-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Apples 1kg",
        unit="kg",
        current_stock=Decimal("45.000"),
        cost_per_unit=Decimal("50.00"),
        retail_price=Decimal("80.00"),
    )
    db.add(item)

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(hours=10)
    to_dt = now + timedelta(hours=1)

    # Existing intake from 5 days ago (outside today's from_dt)
    old_intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number="BAT-APPLE-OLD",
        quantity=Decimal("100.000"),
        initial_quantity=Decimal("100.000"),
        remaining_quantity=Decimal("45.000"),
        unit_cost=Decimal("50.00"),
        intake_date=now - timedelta(days=5),
    )
    db.add(old_intake)

    # Today: Sold 5 units (COGS = 250)
    order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B202",
        total_amount=Decimal("400.00"),
        subtotal_amount=Decimal("400.00"),
        status=OrderStatusEnum.COMPLETED,
        is_void=False,
        created_at=now - timedelta(hours=4),
    )
    db.add(order)

    order_item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        quantity=Decimal("5.000"),
        unit_price=Decimal("80.00"),
        returned_quantity=Decimal("0.000"),
    )
    db.add(order_item)

    cogs_ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        reference_order_id=order.id,
        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
        quantity_change=Decimal("-5.000"),
        resulting_stock=Decimal("45.000"),
        unit_cost_snapshot=Decimal("50.00"),
        created_at=now - timedelta(hours=4),
    )
    db.add(cogs_ledger)
    await db.commit()

    report = await get_inventory_summary_report(db, outlet_id, from_dt, to_dt)
    rb = report.reconciliation_bridge

    assert rb.gross_inward_spend == 0.00
    assert rb.net_supplier_spend == 0.00
    assert rb.cost_of_goods_sold == 250.00
    assert rb.closing_stock_value == 2250.00  # 45 units * 50 = 2,250
    assert rb.opening_stock_value == 2500.00  # 50 units * 50 = 2,500

    # Equation: Opening (2,500) + Inward (0) - COGS (250) == Closing (2,250)
    calculated_closing = rb.opening_stock_value + rb.net_supplier_spend - rb.cost_of_goods_sold - rb.wastage_cost + rb.manual_adjustments
    assert round(calculated_closing, 2) == round(rb.closing_stock_value, 2)


@pytest.mark.asyncio
async def test_voided_order_excluded_from_cogs(db_session: AsyncSession):
    """
    Verify that deductions from voided orders do not leak into COGS.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Voided Order Test Outlet",
        slug=f"void-out-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Milk 1L",
        unit="pcs",
        current_stock=Decimal("10.000"),
        cost_per_unit=Decimal("30.00"),
        retail_price=Decimal("40.00"),
    )
    db.add(item)

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(hours=5)
    to_dt = now + timedelta(hours=1)

    intake = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        batch_number="BAT-MILK-1",
        quantity=Decimal("20.000"),
        initial_quantity=Decimal("20.000"),
        remaining_quantity=Decimal("10.000"),
        unit_cost=Decimal("30.00"),
        intake_date=now - timedelta(hours=4),
    )
    db.add(intake)

    # Voided order
    void_order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="BVOID",
        total_amount=Decimal("80.00"),
        subtotal_amount=Decimal("80.00"),
        status=OrderStatusEnum.CANCELLED,
        is_void=True,
        created_at=now - timedelta(hours=3),
    )
    db.add(void_order)

    void_ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        reference_order_id=void_order.id,
        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
        quantity_change=Decimal("-2.000"),
        resulting_stock=Decimal("18.000"),
        unit_cost_snapshot=Decimal("30.00"),
        created_at=now - timedelta(hours=3),
    )
    db.add(void_ledger)
    await db.commit()

    report = await get_inventory_summary_report(db, outlet_id, from_dt, to_dt)
    rb = report.reconciliation_bridge

    # COGS must be 0 because the order is voided!
    assert rb.cost_of_goods_sold == 0.00
    assert rb.sold_inventory_revenue == 0.00


@pytest.mark.asyncio
async def test_oversold_replenishment_does_not_reduce_cogs(db_session: AsyncSession):
    """
    Verify that inward fulfillment of an oversold deficit (tagged INTAKE / OVERSOLD_RECONCILE)
    does not get subtracted from COGS.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Oversold Replenish Outlet",
        slug=f"ov-rep-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Tomatoes 1kg",
        unit="kg",
        current_stock=Decimal("20.000"),
        cost_per_unit=Decimal("20.00"),
        retail_price=Decimal("35.00"),
    )
    db.add(item)

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(hours=5)
    to_dt = now + timedelta(hours=1)

    # Valid settled order with 5 kg sold
    order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B303",
        total_amount=Decimal("175.00"),
        subtotal_amount=Decimal("175.00"),
        status=OrderStatusEnum.COMPLETED,
        is_void=False,
        created_at=now - timedelta(hours=3),
    )
    db.add(order)

    order_item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        quantity=Decimal("5.000"),
        unit_price=Decimal("35.00"),
        returned_quantity=Decimal("0.000"),
    )
    db.add(order_item)

    cogs_entry = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        reference_order_id=order.id,
        change_type=StockChangeTypeEnum.AUTO_DEDUCTION,
        quantity_change=Decimal("-5.000"),
        resulting_stock=Decimal("15.000"),
        unit_cost_snapshot=Decimal("20.00"),
        created_at=now - timedelta(hours=3),
    )
    db.add(cogs_entry)

    # Oversold deficit fulfillment intake ledger entry
    replenish_ledger = StockLedger(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        item_id=item.id,
        change_type=StockChangeTypeEnum.INTAKE,
        quantity_change=Decimal("10.000"),
        resulting_stock=Decimal("25.000"),
        unit_cost_snapshot=Decimal("20.00"),
        reason="OVERSOLD_RECONCILE",
        created_at=now - timedelta(hours=2),
    )
    db.add(replenish_ledger)
    await db.commit()

    report = await get_inventory_summary_report(db, outlet_id, from_dt, to_dt)
    rb = report.reconciliation_bridge

    # COGS must remain 100 (5 * 20), NOT reduced to 0 or negative by the replenishment
    assert rb.cost_of_goods_sold == 100.00


@pytest.mark.asyncio
async def test_inventory_summary_endpoint_http(client, db_session: AsyncSession):
    """
    Verify that GET /api/analytics/inventory-summary returns 200 and valid JSON
    with the new fields (opening_stock_value, closing_stock_value, customer_discounts, net_sold_revenue).
    """
    from app.core.security import create_access_token, hash_password
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Endpoint Outlet",
        slug=f"ep-out-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    admin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Admin User",
        email="admin@test.com",
        role=RoleEnum.SUPERADMIN,
        password_hash=hash_password("adminpass"),
        status="active",
        is_active=True,
    )
    db.add(admin)
    await db.commit()

    token = create_access_token(user_id=admin.id, outlet_id=outlet_id, role=admin.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/analytics/inventory-summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert "reconciliation_bridge" in data
    bridge = data["reconciliation_bridge"]
    assert "opening_stock_value" in bridge
    assert "closing_stock_value" in bridge
    assert "customer_discounts" in bridge
    assert "net_sold_revenue" in bridge
    assert "gross_inward_spend" in bridge
    assert "net_supplier_spend" in bridge
    assert "cost_of_goods_sold" in bridge
    assert "wastage_cost" in bridge
    assert "realized_net_profit" in bridge
    assert "total_economic_value" in bridge

