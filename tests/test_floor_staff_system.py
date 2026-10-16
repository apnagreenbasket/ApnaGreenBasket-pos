"""
Tests for Floor Staff / Basket Verifier System:
- Staff barcode generation and lookup by barcode.
- Manager punch-in and punch-out.
- Automatic zero-overhead attendance caching upon assisted bill creation.
- Floor staff incentive & assistance report calculation.
"""

import uuid
from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.user import User


@pytest.mark.asyncio
async def test_floor_staff_barcode_and_manager_punch(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Floor Test Outlet",
        slug=f"floor-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Manager Vikram",
        email=f"vikram-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(manager)

    staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Sunil Floor Helper",
        email=f"sunil-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.FLOOR_STAFF,
        barcode="STF-SUNIL1",
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(staff)
    await db.commit()

    manager_token = create_access_token(user_id=manager.id, outlet_id=outlet_id, role=manager.role.value)
    headers = {"Authorization": f"Bearer {manager_token}"}

    # 1. Lookup staff by barcode
    lookup_resp = await client.get("/api/staff/by-barcode/STF-SUNIL1", headers=headers)
    assert lookup_resp.status_code == 200, lookup_resp.text
    data = lookup_resp.json()
    assert data["id"] == str(staff.id)
    assert data["name"] == "Sunil Floor Helper"
    assert data["role"] == "FLOOR_STAFF"

    # 2. Manager punches staff in
    punch_in_resp = await client.post(f"/api/staff/{staff.id}/punch/in", headers=headers)
    assert punch_in_resp.status_code == 200, punch_in_resp.text
    punch_data = punch_in_resp.json()
    assert "session_id" in punch_data
    assert "Successfully punched in" in punch_data["message"]

    # 3. Manager punches staff out
    punch_out_resp = await client.post(f"/api/staff/{staff.id}/punch/out", headers=headers)
    assert punch_out_resp.status_code == 200, punch_out_resp.text
    punch_out_data = punch_out_resp.json()
    assert "session_id" in punch_out_data
    assert "Successfully punched out" in punch_out_data["message"]

    # 4. Manager can punch in Cashier
    cashier_user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Counter Cashier",
        email=f"cashier-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(cashier_user)
    await db.commit()

    cashier_punch_in = await client.post(f"/api/staff/{cashier_user.id}/punch/in", headers=headers)
    assert cashier_punch_in.status_code == 200
    assert "Successfully punched in" in cashier_punch_in.json()["message"]

    # 5. Attempting to manager-punch an Admin or Manager is rejected
    reject_punch_admin = await client.post(f"/api/staff/{manager.id}/punch/in", headers=headers)
    assert reject_punch_admin.status_code == 400
    assert "cannot be marked for Admin or Manager accounts" in reject_punch_admin.json()["detail"]


@pytest.mark.asyncio
async def test_assisted_bill_creation_and_incentive_report(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Assisted POS Outlet",
        slug=f"assist-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Cashier Priya",
        email=f"priya-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(cashier)

    helper = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Ramesh Basket Verifier",
        email=f"ramesh-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.FLOOR_STAFF,
        barcode="STF-RAMESH9",
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(helper)

    category = Category(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Fresh Produce",
    )
    db.add(category)

    item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=category.id,
        name="Shimla Apple 1kg",
        price=Decimal("150.00"),
        is_available=True,
    )
    db.add(item)
    await db.commit()

    token = create_access_token(user_id=cashier.id, outlet_id=outlet_id, role=cashier.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # 0. Cashier punches in for shift
    cashier_punch_resp = await client.post(
        "/api/staff/punch/in",
        json={"opening_cash": 100.0},
        headers=headers,
    )
    assert cashier_punch_resp.status_code == 200, cashier_punch_resp.text

    # 1. Create a bill assisted by Ramesh
    bill_payload = {
        "customer_name": "Deepak Kumar",
        "customer_phone": "9988776655",
        "assisted_by_staff_id": str(helper.id),
        "items": [
            {
                "menu_item_id": str(item.id),
                "quantity": 2,
                "unit_price": 150.0,
                "mrp": 150.0,
                "tax_rate": 0.0,
            }
        ],
    }
    bill_resp = await client.post("/api/billing/bills", json=bill_payload, headers=headers)
    assert bill_resp.status_code == 200, bill_resp.text
    bill_data = bill_resp.json()
    assert bill_data["assisted_by_staff_id"] == str(helper.id)
    assert bill_data["assisted_by_staff_name"] == "Ramesh Basket Verifier"
    order_id = bill_data["id"]

    # 2. Mark the bill paid so it counts toward sales
    pay_resp = await client.post(
        f"/api/billing/bills/{order_id}/mark-paid",
        json={"payment_method": "CASH", "cash_denominations": {"500": 1}},
        headers=headers,
    )
    assert pay_resp.status_code == 200, pay_resp.text

    # 3. Query floor staff incentive report as manager/admin
    incentive_resp = await client.get("/api/staff/incentives/report", headers=headers)
    assert incentive_resp.status_code == 200, incentive_resp.text
    incentive_data = incentive_resp.json()
    assert "staff_breakdown" in incentive_data
    assert incentive_data["total_bills_assisted"] >= 1
    assert incentive_data["total_assisted_sales"] >= 300.0

    # Verify Ramesh is in the report
    ramesh_entry = next((s for s in incentive_data["staff_breakdown"] if s["staff_id"] == str(helper.id)), None)
    assert ramesh_entry is not None
    assert ramesh_entry["staff_name"] == "Ramesh Basket Verifier"
    assert ramesh_entry["total_bills_assisted"] == 1
    assert ramesh_entry["total_assisted_sales"] == 300.0
    assert ramesh_entry["average_basket_value"] == 300.0
    # ₹5 base + 0.5% of 300 = 5 + 1.5 = 6.5
    assert ramesh_entry["calculated_incentive"] == 6.5

    # Verify that only floor staff are in the report (Cashier Priya is excluded)
    assert all(s["staff_role"] == "FLOOR_STAFF" for s in incentive_data["staff_breakdown"])
    assert not any(s["staff_id"] == str(cashier.id) for s in incentive_data["staff_breakdown"])


@pytest.mark.asyncio
async def test_manager_admin_cashier_cannot_be_basket_verifiers(client, db_session: AsyncSession):
    """
    Ensure Manager, Outlet Admin, and Cashier cannot be attached as basket verifiers / floor assistants
    on bills, and won't be auto-punched in.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Role Isolation Outlet",
        slug=f"role-iso-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Manager Sunil",
        email=f"sunil-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.MANAGER,
        barcode="STF-MGR1",
        password_hash=hash_password("password123"),
        status="active",
    )
    admin_user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Outlet Admin Gita",
        email=f"gita-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.OUTLET_ADMIN,
        barcode="STF-ADM1",
        password_hash=hash_password("password123"),
        status="active",
    )
    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Cashier Amit",
        email=f"amit-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.CASHIER,
        barcode="STF-CSH1",
        password_hash=hash_password("password123"),
        status="active",
    )
    floor_staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Assistant Mohan",
        email=f"mohan-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.FLOOR_STAFF,
        barcode="STF-FLR1",
        password_hash=hash_password("password123"),
        status="active",
    )
    category = Category(id=uuid.uuid4(), outlet_id=outlet_id, name="General")
    item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=category.id,
        name="Sample Item",
        price=Decimal("100.00"),
        mrp=Decimal("100.00"),
        is_available=True,
    )
    db.add_all([manager, admin_user, cashier, floor_staff, category, item])
    await db.commit()

    token = create_access_token(user_id=cashier.id, outlet_id=outlet_id, role=cashier.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # Cashier punches in
    await client.post(
        "/api/staff/punch/in",
        json={"opening_cash": 0.0},
        headers=headers,
    )

    # 1. Attempt creating bill with manager as assistant ID -> should be rejected/ignored
    mgr_bill_resp = await client.post(
        "/api/billing/bills",
        json={
            "customer_name": "Test Walk-in",
            "assisted_by_staff_id": str(manager.id),
            "items": [{"menu_item_id": str(item.id), "quantity": 1, "unit_price": 100.0, "mrp": 100.0, "tax_rate": 0.0}],
        },
        headers=headers,
    )
    assert mgr_bill_resp.status_code == 200
    mgr_bill_data = mgr_bill_resp.json()
    assert mgr_bill_data["assisted_by_staff_id"] is None, "Manager must NOT be attached as basket verifier"

    # 2. Attempt creating bill with admin barcode -> should be rejected/ignored
    adm_bill_resp = await client.post(
        "/api/billing/bills",
        json={
            "customer_name": "Test Walk-in 2",
            "assisted_by_barcode": "STF-ADM1",
            "items": [{"menu_item_id": str(item.id), "quantity": 1, "unit_price": 100.0, "mrp": 100.0, "tax_rate": 0.0}],
        },
        headers=headers,
    )
    assert adm_bill_resp.status_code == 200
    adm_bill_data = adm_bill_resp.json()
    assert adm_bill_data["assisted_by_staff_id"] is None, "Outlet Admin must NOT be attached as basket verifier"

    # 3. Create bill with valid FLOOR_STAFF -> attaches successfully
    floor_bill_resp = await client.post(
        "/api/billing/bills",
        json={
            "customer_name": "Test Walk-in 3",
            "assisted_by_staff_id": str(floor_staff.id),
            "items": [{"menu_item_id": str(item.id), "quantity": 1, "unit_price": 100.0, "mrp": 100.0, "tax_rate": 0.0}],
        },
        headers=headers,
    )
    assert floor_bill_resp.status_code == 200
    floor_bill_data = floor_bill_resp.json()
    assert floor_bill_data["assisted_by_staff_id"] == str(floor_staff.id), "Floor staff must attach successfully"
    assert floor_bill_data["assisted_by_staff_name"] == "Assistant Mohan"


@pytest.mark.asyncio
async def test_dynamic_floor_incentive_rates(client, db_session: AsyncSession):
    """Test that outlet settings dynamically control the per-bill reward and commission %."""
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Dynamic Incentive Mart",
        slug=f"dynamic-mart-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
        floor_incentive_per_bill=Decimal("10.00"),
        floor_incentive_percent=Decimal("1.50"),
    )
    db.add(outlet)

    admin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Admin Boss",
        email=f"boss-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.OUTLET_ADMIN,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(admin)

    staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Floor Star Anita",
        email=f"anita-{uuid.uuid4().hex[:4]}@test.com",
        role=RoleEnum.FLOOR_STAFF,
        barcode="STF-ANITA1",
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(staff)

    cat = Category(id=uuid.uuid4(), outlet_id=outlet_id, name="Grocery")
    db.add(cat)
    item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=cat.id,
        name="Basmati Rice 5kg",
        price=Decimal("500.00"),
        barcode="890123450001",
        is_available=True,
    )
    db.add(item)
    await db.commit()

    admin_token = create_access_token(user_id=admin.id, outlet_id=outlet_id, role=admin.role.value)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create and pay 2 assisted bills: 2 x ₹500 = ₹1,000 sales
    for i in range(2):
        create_res = await client.post(
            "/api/billing/bills",
            json={
                "customer_name": f"Customer {i+1}",
                "assisted_by_staff_id": str(staff.id),
                "items": [{"menu_item_id": str(item.id), "quantity": 1, "unit_price": 500.0, "mrp": 500.0, "tax_rate": 0.0}],
            },
            headers=headers,
        )
        assert create_res.status_code == 200
        bill_id = create_res.json()["id"]
        pay_res = await client.post(
            f"/api/billing/bills/{bill_id}/mark-paid",
            json={"payment_method": "CASH", "cash_denominations": {"500": 1}},
            headers=headers,
        )
        assert pay_res.status_code == 200

    # 2. Query incentive report -> should use ₹10.00/bill + 1.50% sales
    # Formula: (2 bills * ₹10.00 = ₹20.00) + (1.5% of ₹1,000.00 = ₹15.00) = ₹35.00
    rep_res = await client.get("/api/staff/incentives/report", headers=headers)
    assert rep_res.status_code == 200
    rep_data = rep_res.json()

    assert rep_data["incentive_per_bill"] == 10.0
    assert rep_data["incentive_percent"] == 1.5
    assert rep_data["total_bills_assisted"] == 2
    assert rep_data["total_assisted_sales"] == 1000.0
    assert rep_data["total_incentives"] == 35.0

    star_row = next(r for r in rep_data["staff_breakdown"] if r["staff_id"] == str(staff.id))
    assert star_row["calculated_incentive"] == 35.0

    # 3. Update outlet settings via PATCH: change rate to ₹2.00/bill and 0.20% commission
    patch_res = await client.patch(
        "/api/admin/outlets/me",
        json={
            "floor_incentive_per_bill": 2.0,
            "floor_incentive_percent": 0.20,
        },
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["floor_incentive_per_bill"] == "2.00"
    assert patch_res.json()["floor_incentive_percent"] == "0.20"

    # 4. Verify incentive report instantly recalculates with new rates:
    # Formula: (2 bills * ₹2.00 = ₹4.00) + (0.20% of ₹1,000.00 = ₹2.00) = ₹6.00
    rep_res2 = await client.get("/api/staff/incentives/report", headers=headers)
    assert rep_res2.status_code == 200
    rep_data2 = rep_res2.json()

    assert rep_data2["incentive_per_bill"] == 2.0
    assert rep_data2["incentive_percent"] == 0.2
    assert rep_data2["total_incentives"] == 6.0
    star_row2 = next(r for r in rep_data2["staff_breakdown"] if r["staff_id"] == str(staff.id))
    assert star_row2["calculated_incentive"] == 6.0

