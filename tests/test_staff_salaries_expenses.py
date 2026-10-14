import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.enums import RoleEnum
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_payroll_staff_lifecycle_and_salary_payout(client: AsyncClient, db_session: AsyncSession):
    # 1. Create test outlet & admin user
    outlet = await create_test_outlet(db_session, slug="payroll-test-outlet")
    admin = await create_test_user(db_session, outlet=outlet, email="admin@payrolltest.com", role=RoleEnum.SUPERADMIN)
    headers = get_auth_headers(admin, outlet)

    # 2. Onboard physical ground worker to payroll_staff via API
    create_res = await client.post(
        "/api/admin/expenses/payroll-staff",
        json={
            "name": "Ramu Cleaner",
            "role": "Cleaner & Helper",
            "phone": "9876543210",
            "base_salary": 12000.0,
            "notes": "Store floor cleaning and packing",
        },
        headers=headers,
    )
    assert create_res.status_code == 201, create_res.text
    staff = create_res.json()
    staff_id = staff["id"]
    assert staff["name"] == "Ramu Cleaner"
    assert staff["base_salary"] == 12000.0

    # 3. Check salary roster for October 2026
    # MUST contain Ramu Cleaner, and MUST NOT contain admin / superadmin!
    res = await client.get("/api/admin/expenses/staff-salaries?month=2026-10", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["month"] == "2026-10"
    assert data["total_staff"] == 1
    ramu_item = data["items"][0]
    assert ramu_item["staff_id"] == staff_id
    assert ramu_item["staff_name"] == "Ramu Cleaner"
    assert ramu_item["role"] == "Cleaner & Helper"
    assert ramu_item["base_salary"] == 12000.0
    assert ramu_item["is_paid"] is False

    # 4. Update full staff details via PATCH /api/admin/expenses/payroll-staff/{staff_id}
    patch_staff_res = await client.patch(
        f"/api/admin/expenses/payroll-staff/{staff_id}",
        json={
            "name": "Ramu Store Manager",
            "role": "Manager / Store Manager",
            "phone": "9812345678",
            "base_salary": 18000.0,
            "notes": "Promoted to store manager",
        },
        headers=headers,
    )
    assert patch_staff_res.status_code == 200, patch_staff_res.text
    updated_staff = patch_staff_res.json()
    assert updated_staff["name"] == "Ramu Store Manager"
    assert updated_staff["role"] == "Manager / Store Manager"
    assert updated_staff["base_salary"] == 18000.0
    assert updated_staff["phone"] == "9812345678"
    assert updated_staff["notes"] == "Promoted to store manager"

    # Also verify salary roster reflects updated details and notes
    roster_check_res = await client.get("/api/admin/expenses/staff-salaries?month=2026-10", headers=headers)
    assert roster_check_res.status_code == 200
    roster_item = roster_check_res.json()["items"][0]
    assert roster_item["staff_name"] == "Ramu Store Manager"
    assert roster_item["role"] == "Manager / Store Manager"
    assert roster_item["base_salary"] == 18000.0
    assert roster_item["notes"] == "Promoted to store manager"

    # 5. Pay salary via POST /api/admin/expenses
    pay_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "SALARY",
            "amount": 14000.0,
            "payment_method": "CASH",
            "description": "Salary for October 2026",
            "expense_date": "2026-10-14T10:00:00",
            "recipient_staff_id": staff_id,
            "salary_month": "2026-10",
        },
        headers=headers,
    )
    assert pay_res.status_code == 201, pay_res.text
    expense_data = pay_res.json()
    assert expense_data["category"] == "SALARY"
    assert expense_data["amount"] == 14000.0
    assert expense_data["salary_month"] == "2026-10"
    assert expense_data["recipient_staff_id"] == staff_id
    assert expense_data["recipient_staff_name"] == "Ramu Store Manager"

    # 6. Check salary roster again — should show is_paid = True
    res_after = await client.get("/api/admin/expenses/staff-salaries?month=2026-10", headers=headers)
    assert res_after.status_code == 200
    data_after = res_after.json()
    assert data_after["paid_count"] == 1
    assert data_after["pending_count"] == 0
    assert data_after["total_salary_paid"] == 14000.0
    ramu_after = data_after["items"][0]
    assert ramu_after["is_paid"] is True
    assert ramu_after["paid_amount"] == 14000.0
    assert ramu_after["payment_method"] == "CASH"


@pytest.mark.asyncio
async def test_expense_and_salary_month_attribution(client: AsyncClient, db_session: AsyncSession):
    """
    Test that recording an expense or salary with an October date:
    1. Calculates strictly inside October's P&L and total expenses.
    2. Does NOT count towards November's total expenses or P&L.
    """
    outlet = await create_test_outlet(db_session, slug="attribution-test-outlet")
    admin = await create_test_user(db_session, outlet=outlet, email="admin@attribtest.com", role=RoleEnum.SUPERADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Log an October expense (e.g. Rent = 25000, Date = 2026-10-05)
    rent_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "RENT",
            "amount": 25000.0,
            "payment_method": "BANK_TRANSFER",
            "expense_date": "2026-10-05T12:00:00",
            "description": "October store rent",
        },
        headers=headers,
    )
    assert rent_res.status_code == 201, rent_res.text

    # 2. Log an October salary (Amount = 15000, Date = 2026-10-31, salary_month = "2026-10")
    sal_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "SALARY",
            "amount": 15000.0,
            "payment_method": "CASH",
            "salary_month": "2026-10",
            "expense_date": "2026-10-31T12:00:00",
            "description": "Staff salary October",
        },
        headers=headers,
    )
    assert sal_res.status_code == 201, sal_res.text

    # 3. Log a November expense (e.g. Electricity = 5000, Date = 2026-11-02)
    nov_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "ELECTRICITY",
            "amount": 5000.0,
            "payment_method": "UPI",
            "expense_date": "2026-11-02T12:00:00",
            "description": "November electricity bill",
        },
        headers=headers,
    )
    assert nov_res.status_code == 201, nov_res.text

    # 4. Check October summary (2026-10-01 to 2026-10-31)
    oct_summary_res = await client.get(
        "/api/admin/expenses/summary?from_date=2026-10-01T00:00:00&to_date=2026-10-31T23:59:59",
        headers=headers,
    )
    assert oct_summary_res.status_code == 200
    oct_summary = oct_summary_res.json()
    # October total expenses must be 25000 (Rent) + 15000 (Salary) = 40000
    assert oct_summary["total_expenses"] == 40000.0
    # Must NOT include November's 5000 electricity
    cat_map_oct = {c["category"]: c["total"] for c in oct_summary["expenses_by_category"]}
    assert cat_map_oct.get("RENT") == 25000.0
    assert cat_map_oct.get("SALARY") == 15000.0
    assert "ELECTRICITY" not in cat_map_oct

    # 5. Check November summary (2026-11-01 to 2026-11-30)
    nov_summary_res = await client.get(
        "/api/admin/expenses/summary?from_date=2026-11-01T00:00:00&to_date=2026-11-30T23:59:59",
        headers=headers,
    )
    assert nov_summary_res.status_code == 200
    nov_summary = nov_summary_res.json()
    # November total expenses must ONLY be 5000.0
    assert nov_summary["total_expenses"] == 5000.0
    cat_map_nov = {c["category"]: c["total"] for c in nov_summary["expenses_by_category"]}
    assert cat_map_nov.get("ELECTRICITY") == 5000.0
    assert "RENT" not in cat_map_nov
    assert "SALARY" not in cat_map_nov


@pytest.mark.asyncio
async def test_payroll_staff_mobile_uniqueness_and_required(client: AsyncClient, db_session: AsyncSession):
    """
    Test that:
    1. Mobile number is mandatory when adding staff.
    2. Mobile number must be unique in the outlet.
    3. Editing to an already taken number returns 409 Conflict.
    4. Editing own other fields while keeping same mobile number succeeds.
    """
    outlet = await create_test_outlet(db_session, slug="phone-unique-outlet")
    admin = await create_test_user(db_session, outlet=outlet, email="admin@phoneunique.com", role=RoleEnum.SUPERADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Onboarding without mobile should fail (422 validation error or 400)
    missing_phone_res = await client.post(
        "/api/admin/expenses/payroll-staff",
        json={
            "name": "No Phone Staff",
            "role": "Helper",
            "base_salary": 10000.0,
        },
        headers=headers,
    )
    assert missing_phone_res.status_code in (400, 422)

    # 2. Onboard first staff with valid 10-digit mobile
    s1_res = await client.post(
        "/api/admin/expenses/payroll-staff",
        json={
            "name": "Staff One",
            "role": "Cashier",
            "phone": "9876543211",
            "base_salary": 15000.0,
        },
        headers=headers,
    )
    assert s1_res.status_code == 201, s1_res.text
    s1_id = s1_res.json()["id"]

    # 3. Attempt to onboard second staff with SAME mobile number (should return 409 Conflict)
    s2_dup_res = await client.post(
        "/api/admin/expenses/payroll-staff",
        json={
            "name": "Staff Two Duplicate",
            "role": "Cleaner",
            "phone": "9876543211",
            "base_salary": 12000.0,
        },
        headers=headers,
    )
    assert s2_dup_res.status_code == 409
    assert "already exists" in s2_dup_res.json()["detail"]

    # 4. Onboard second staff with different unique mobile
    s2_res = await client.post(
        "/api/admin/expenses/payroll-staff",
        json={
            "name": "Staff Two",
            "role": "Manager / Store Manager",
            "phone": "9876543222",
            "base_salary": 20000.0,
        },
        headers=headers,
    )
    assert s2_res.status_code == 201
    s2_id = s2_res.json()["id"]

    # 5. Edit s2 phone to s1 phone (should return 409 Conflict)
    edit_dup_res = await client.patch(
        f"/api/admin/expenses/payroll-staff/{s2_id}",
        json={"phone": "9876543211"},
        headers=headers,
    )
    assert edit_dup_res.status_code == 409
    assert "already has" in edit_dup_res.json()["detail"]

    # 6. Edit s2 name and salary keeping same phone (should succeed 200)
    edit_ok_res = await client.patch(
        f"/api/admin/expenses/payroll-staff/{s2_id}",
        json={
            "name": "Staff Two Promoted",
            "phone": "9876543222",
            "base_salary": 25000.0,
        },
        headers=headers,
    )
    assert edit_ok_res.status_code == 200
    assert edit_ok_res.json()["name"] == "Staff Two Promoted"
    assert edit_ok_res.json()["base_salary"] == 25000.0


