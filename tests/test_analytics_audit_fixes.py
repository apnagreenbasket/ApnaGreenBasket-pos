"""
Verification tests for analytics audit fixes:
- Customer returns event timing (returns query CustomerReturn.created_at, avoiding retrospective alteration of historical sales).
- Unreferenced returns included in returns.
- Category sales discount proration.
- Day book cash reconciliation (cash_sales, cash_refunds, closing_cash).
- Wastage report audit corrections tracking.
- Order funnel pending and paid categorization.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.customer_return import CustomerReturn
from app.models.enums import RoleEnum, OrderStatusEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.supplier import Supplier
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_analytics_return_event_timing_and_unreferenced_returns(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-1", name="Audit Outlet 1")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit1@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(
        db_session, outlet, cat, name="Fresh Mangoes", price=Decimal("200.00")
    )
    auth_headers = get_auth_headers(admin, outlet)

    day1 = (datetime.now(timezone.utc) - timedelta(days=2)).replace(tzinfo=None)
    day2 = (datetime.now(timezone.utc) - timedelta(days=1)).replace(tzinfo=None)

    # Day 1: Order created for ₹200
    order = Order(
        outlet_id=outlet.id,
        basket_number="BK-AUDIT-1",
        status=OrderStatusEnum.PAID,
        payment_method="CASH",
        total_amount=Decimal("200.00"),
        subtotal_amount=Decimal("200.00"),
        tax_amount=Decimal("0.00"),
        cash_amount=Decimal("200.00"),
        created_at=day1,
    )
    db_session.add(order)
    await db_session.flush()

    o_item = OrderItem(
        order_id=order.id,
        menu_item_id=item.id,
        item_name="Fresh Mangoes",
        quantity=Decimal("1.0"),
        unit_price=Decimal("200.00"),
        line_total=Decimal("200.00"),
        tax_rate=Decimal("0.00"),
    )
    db_session.add(o_item)

    # Day 2: Return happens for ₹100 on the day1 order
    ret1 = CustomerReturn(
        outlet_id=outlet.id,
        order_id=order.id,
        return_number="RET-AUDIT-1",
        total_refund_amount=Decimal("100.00"),
        gross_return_amount=Decimal("100.00"),
        refund_payment_method="CASH",
        created_at=day2,
    )
    db_session.add(ret1)

    # Day 2: Also an unreferenced walk-in return for ₹50
    ret2 = CustomerReturn(
        outlet_id=outlet.id,
        order_id=None,
        return_number="RET-AUDIT-2",
        total_refund_amount=Decimal("50.00"),
        gross_return_amount=Decimal("50.00"),
        refund_payment_method="CASH",
        created_at=day2,
    )
    db_session.add(ret2)
    await db_session.commit()

    # Query Day 1 KPI: Returns MUST be 0, Net sales MUST be 200
    d1_from = (day1 - timedelta(hours=1)).isoformat()
    d1_to = (day1 + timedelta(hours=1)).isoformat()
    res_d1 = await client.get(
        f"/api/analytics/kpi-summary?from_date={d1_from}&to_date={d1_to}",
        headers=auth_headers,
    )
    assert res_d1.status_code == 200
    kpi1 = res_d1.json()
    assert kpi1["gross_revenue"] == 200.0
    assert kpi1["total_return_amount"] == 0.0
    assert kpi1["net_revenue"] == 200.0

    # Query Day 2 KPI: Returns MUST capture both referenced and unreferenced (100 + 50 = 150)
    d2_from = (day2 - timedelta(hours=1)).isoformat()
    d2_to = (day2 + timedelta(hours=1)).isoformat()
    res_d2 = await client.get(
        f"/api/analytics/kpi-summary?from_date={d2_from}&to_date={d2_to}",
        headers=auth_headers,
    )
    assert res_d2.status_code == 200
    kpi2 = res_d2.json()
    assert kpi2["total_return_amount"] == 150.0


@pytest.mark.asyncio
async def test_category_sales_prorates_discount(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-2", name="Audit Outlet 2")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit2@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet, name="Beverages")
    item = await create_test_menu_item(
        db_session, outlet, cat, name="Orange Juice", price=Decimal("100.00")
    )
    auth_headers = get_auth_headers(admin, outlet)

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    # Order with subtotal 100, discount 20, total 80
    order = Order(
        outlet_id=outlet.id,
        basket_number="BK-AUDIT-DISC",
        status=OrderStatusEnum.PAID,
        payment_method="CASH",
        subtotal_amount=Decimal("100.00"),
        discount_value=Decimal("20.00"),
        discount_status="APPROVED",
        total_amount=Decimal("80.00"),
        cash_amount=Decimal("80.00"),
        created_at=now_utc,
    )
    db_session.add(order)
    await db_session.flush()

    o_item = OrderItem(
        order_id=order.id,
        menu_item_id=item.id,
        item_name="Orange Juice",
        quantity=Decimal("1.0"),
        unit_price=Decimal("100.00"),
        line_total=Decimal("100.00"),
        tax_rate=Decimal("0.00"),
    )
    db_session.add(o_item)
    await db_session.commit()

    f_dt = (now_utc - timedelta(hours=1)).isoformat()
    t_dt = (now_utc + timedelta(hours=1)).isoformat()
    res = await client.get(
        f"/api/analytics/category-sales?from_date={f_dt}&to_date={t_dt}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    cat_data = res.json()
    assert cat_data["total_revenue"] == 80.0
    assert len(cat_data["items"]) == 1
    # Billed revenue for category should be 80.0 (net of discount), not un-discounted 100.0
    assert cat_data["items"][0]["revenue"] == 80.0


@pytest.mark.asyncio
async def test_day_book_cash_reconciliation_and_closing_cash(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-3", name="Audit Outlet 3")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit3@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    auth_headers = get_auth_headers(admin, outlet)

    from app.core.shift_utils import IST
    now_ist = datetime.now(IST)
    today_str = now_ist.strftime("%Y-%m-%d")

    # Order paid by CASH: 300
    # Order paid by UPI: 200
    order_cash = Order(
        outlet_id=outlet.id,
        basket_number="BK-AUDIT-CASH",
        status=OrderStatusEnum.PAID,
        payment_method="CASH",
        subtotal_amount=Decimal("300.00"),
        total_amount=Decimal("300.00"),
        cash_amount=Decimal("300.00"),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    order_upi = Order(
        outlet_id=outlet.id,
        basket_number="BK-AUDIT-UPI",
        status=OrderStatusEnum.PAID,
        payment_method="UPI",
        subtotal_amount=Decimal("200.00"),
        total_amount=Decimal("200.00"),
        upi_amount=Decimal("200.00"),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    # Cash return: 50
    ret_cash = CustomerReturn(
        outlet_id=outlet.id,
        return_number="RET-AUDIT-CASH",
        total_refund_amount=Decimal("50.00"),
        gross_return_amount=Decimal("50.00"),
        refund_payment_method="CASH",
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add_all([order_cash, order_upi, ret_cash])
    await db_session.commit()

    res = await client.get(
        f"/api/analytics/day-book?date={today_str}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    day_book = res.json()
    assert day_book["total_sales"] == 500.0
    assert day_book["cash_sales"] == 300.0
    assert day_book["cash_refunds"] == 50.0
    # closing_cash = opening_cash (0) + cash_sales (300) - cash_refunds (50) = 250
    assert day_book["closing_cash"] == 250.0


@pytest.mark.asyncio
async def test_top_selling_items_true_revenue_share(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-4", name="Audit Outlet 4")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit4@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet, name="Snacks")
    item1 = await create_test_menu_item(
        db_session, outlet, cat, name="Chips A", price=Decimal("100.00")
    )
    item2 = await create_test_menu_item(
        db_session, outlet, cat, name="Cookies B", price=Decimal("100.00")
    )
    auth_headers = get_auth_headers(admin, outlet)

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    order = Order(
        outlet_id=outlet.id,
        basket_number="BK-TOP-ITEMS",
        status=OrderStatusEnum.PAID,
        payment_method="CASH",
        total_amount=Decimal("200.00"),
        subtotal_amount=Decimal("200.00"),
        created_at=now_utc,
    )
    db_session.add(order)
    await db_session.flush()

    o1 = OrderItem(
        order_id=order.id,
        menu_item_id=item1.id,
        item_name="Chips A",
        quantity=Decimal("1.0"),
        unit_price=Decimal("100.00"),
        line_total=Decimal("100.00"),
        tax_rate=Decimal("0.00"),
    )
    o2 = OrderItem(
        order_id=order.id,
        menu_item_id=item2.id,
        item_name="Cookies B",
        quantity=Decimal("1.0"),
        unit_price=Decimal("100.00"),
        line_total=Decimal("100.00"),
        tax_rate=Decimal("0.00"),
    )
    db_session.add_all([o1, o2])
    await db_session.commit()

    f_dt = (now_utc - timedelta(hours=1)).isoformat()
    t_dt = (now_utc + timedelta(hours=1)).isoformat()

    # Query with limit=1: Top item sells 100 out of 200 store sales.
    # Revenue share MUST be 50%, not 100%!
    res = await client.get(
        f"/api/analytics/top-items?limit=1&from_date={f_dt}&to_date={t_dt}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["revenue"] == 100.0
    assert data["items"][0]["revenue_share_pct"] == 50.0


@pytest.mark.asyncio
async def test_order_funnel_statuses(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-5", name="Audit Outlet 5")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit5@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    auth_headers = get_auth_headers(admin, outlet)

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    # 1 PAYMENT_PENDING order (should fall in PENDING stage)
    # 1 PARTIALLY_REFUNDED order (should fall in PAID stage)
    o_pending = Order(
        outlet_id=outlet.id,
        basket_number="BK-FUNNEL-PP",
        status=OrderStatusEnum.PAYMENT_PENDING,
        payment_method="UPI",
        total_amount=Decimal("150.00"),
        created_at=now_utc,
    )
    o_part_ref = Order(
        outlet_id=outlet.id,
        basket_number="BK-FUNNEL-PR",
        status=OrderStatusEnum.PARTIALLY_REFUNDED,
        payment_method="CASH",
        total_amount=Decimal("250.00"),
        created_at=now_utc,
    )
    db_session.add_all([o_pending, o_part_ref])
    await db_session.commit()

    f_dt = (now_utc - timedelta(hours=1)).isoformat()
    t_dt = (now_utc + timedelta(hours=1)).isoformat()
    res = await client.get(
        f"/api/analytics/funnel?from_date={f_dt}&to_date={t_dt}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    stages = {s["stage"]: s["count"] for s in data["stages"]}
    assert stages["PENDING"] == 1
    assert stages["PAID"] == 1


@pytest.mark.asyncio
async def test_supplier_spend_excludes_deficit_batches(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-6", name="Audit Outlet 6")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit6@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    supplier = Supplier(
        outlet_id=outlet.id,
        name="Global Farm Supplier",
        contact_person="Farmer John",
        phone="9988776655",
    )
    db_session.add(supplier)
    await db_session.flush()

    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat)
    auth_headers = get_auth_headers(admin, outlet)

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    # Legitimate intake: 10 units @ ₹50 = ₹500
    intake_valid = StockIntake(
        outlet_id=outlet.id,
        supplier_id=supplier.id,
        item_id=item.id,
        batch_number="BAT-REAL-001",
        quantity=Decimal("10.0"),
        remaining_quantity=Decimal("10.0"),
        unit_cost=Decimal("50.00"),
        intake_date=now_utc,
    )
    # Virtual oversell deficit batch: 5 units @ ₹50 = ₹250 (MUST BE EXCLUDED)
    intake_oversell = StockIntake(
        outlet_id=outlet.id,
        supplier_id=supplier.id,
        item_id=item.id,
        batch_number="BAT-OV-VIRTUAL-001",
        quantity=Decimal("5.0"),
        remaining_quantity=Decimal("0.0"),
        unit_cost=Decimal("50.00"),
        intake_date=now_utc,
    )
    db_session.add_all([intake_valid, intake_oversell])
    await db_session.commit()

    f_dt = (now_utc - timedelta(hours=1)).isoformat()
    t_dt = (now_utc + timedelta(hours=1)).isoformat()
    res = await client.get(
        f"/api/analytics/supplier-spend?from_date={f_dt}&to_date={t_dt}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_spend"] == 500.0
    assert len(data["suppliers"]) == 1
    assert data["suppliers"][0]["total_spend"] == 500.0


@pytest.mark.asyncio
async def test_supplier_spend_excludes_voided_batches(
    client: AsyncClient, db_session: AsyncSession
):
    outlet = await create_test_outlet(db_session, slug="audit-outlet-void-spend", name="Audit Outlet Void Spend")
    admin = await create_test_user(
        db_session, outlet, email="admin_audit_void@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    supplier = Supplier(
        outlet_id=outlet.id,
        name="Fresh Farm Wholesale",
        contact_person="Ramesh",
        phone="9876543210",
    )
    db_session.add(supplier)
    await db_session.flush()

    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat)
    inv_item = InventoryItem(
        outlet_id=outlet.id,
        name=item.name,
        current_stock=Decimal("30.000"),
        unit="kg",
        cost_per_unit=Decimal("40.00"),
    )
    db_session.add(inv_item)
    await db_session.flush()

    auth_headers = get_auth_headers(admin, outlet)
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    # Batch 1 (Active): 10 kg @ ₹50 = ₹500
    intake_active = StockIntake(
        outlet_id=outlet.id,
        supplier_id=supplier.id,
        item_id=inv_item.id,
        batch_number="BAT-ACTIVE-001",
        quantity=Decimal("10.0"),
        remaining_quantity=Decimal("10.0"),
        unit_cost=Decimal("50.00"),
        intake_date=now_utc,
    )
    # Batch 2 (To be voided): 20 kg @ ₹40 = ₹800
    intake_void = StockIntake(
        outlet_id=outlet.id,
        supplier_id=supplier.id,
        item_id=inv_item.id,
        batch_number="BAT-VOID-002",
        quantity=Decimal("20.0"),
        remaining_quantity=Decimal("20.0"),
        unit_cost=Decimal("40.00"),
        intake_date=now_utc,
    )
    db_session.add_all([intake_active, intake_void])
    await db_session.commit()

    f_dt = (now_utc - timedelta(hours=1)).isoformat()
    t_dt = (now_utc + timedelta(hours=1)).isoformat()

    # Prior to voiding: total spend is ₹1300.0 (500 + 800)
    res_before = await client.get(
        f"/api/analytics/supplier-spend?from_date={f_dt}&to_date={t_dt}",
        headers=auth_headers,
    )
    assert res_before.status_code == 200
    assert res_before.json()["total_spend"] == 1300.0
    assert res_before.json()["suppliers"][0]["total_intakes"] == 2

    # Void Batch 2
    res_void = await client.post(
        f"/api/admin/inventory/batches/{intake_void.id}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "VOID_BATCH",
            "quantity": 20.0,
            "notes": "Accidentally added batch - cancelled",
        },
    )
    assert res_void.status_code == 200

    # After voiding: total spend MUST deduct the ₹800 voided batch and only be ₹500.0
    res_after = await client.get(
        f"/api/analytics/supplier-spend?from_date={f_dt}&to_date={t_dt}",
        headers=auth_headers,
    )
    assert res_after.status_code == 200
    data_after = res_after.json()
    assert data_after["total_spend"] == 500.0
    assert data_after["suppliers"][0]["total_spend"] == 500.0
    assert data_after["suppliers"][0]["total_quantity"] == 10.0
    assert data_after["suppliers"][0]["total_intakes"] == 1
    # Batches breakdown should only contain the active batch
    assert len(data_after["suppliers"][0]["batches"]) == 1
    assert data_after["suppliers"][0]["batches"][0]["batch_number"] == "BAT-ACTIVE-001"
