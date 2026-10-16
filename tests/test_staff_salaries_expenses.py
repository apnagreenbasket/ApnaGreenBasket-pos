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


@pytest.mark.asyncio
async def test_daily_petty_cash_expenses(client: AsyncClient, db_session: AsyncSession):
    """
    Test logging daily ₹100 and ₹200 petty cash expenses (Tea, Auto, Cleaning, Labour)
    and verifying they appear in the monthly P&L and category breakdown.
    """
    outlet = await create_test_outlet(db_session, slug="petty-cash-outlet")
    admin = await create_test_user(db_session, outlet=outlet, email="admin@pettycash.com", role=RoleEnum.SUPERADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Log ₹50 Tea / Refreshment expense
    tea_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "TEA_REFRESHMENTS",
            "amount": 50.0,
            "payment_method": "CASH",
            "description": "Evening chai and samosas for staff",
            "expense_date": "2026-10-15T16:30:00",
        },
        headers=headers,
    )
    assert tea_res.status_code == 201, tea_res.text
    tea = tea_res.json()
    assert tea["category"] == "TEA_REFRESHMENTS"
    assert tea["amount"] == 50.0

    # 2. Log ₹100 Auto Fare expense
    auto_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "CONVEYANCE_AUTO",
            "amount": 100.0,
            "payment_method": "CASH",
            "description": "Auto fare to bring emergency plastic bags",
            "expense_date": "2026-10-15T11:00:00",
        },
        headers=headers,
    )
    assert auto_res.status_code == 201, auto_res.text

    # 3. Log ₹200 Cleaning Supplies expense
    clean_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "CLEANING_SUPPLIES",
            "amount": 200.0,
            "payment_method": "UPI",
            "description": "Floor cleaner and broom",
            "expense_date": "2026-10-15T12:00:00",
        },
        headers=headers,
    )
    assert clean_res.status_code == 201, clean_res.text

    # 4. Log ₹200 Daily Labour expense
    labour_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "DAILY_LABOUR",
            "amount": 200.0,
            "payment_method": "CASH",
            "description": "Unloading crate helper",
            "expense_date": "2026-10-15T09:00:00",
        },
        headers=headers,
    )
    assert labour_res.status_code == 201, labour_res.text

    # 5. Log ₹350 Oil expense
    oil_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "OIL",
            "amount": 350.0,
            "payment_method": "CASH",
            "description": "Generator engine oil & diesel fuel",
            "expense_date": "2026-10-15T10:00:00",
        },
        headers=headers,
    )
    assert oil_res.status_code == 201, oil_res.text

    # 6. Verify Monthly Summary contains all petty cash expenses: total = 550 + 350 = 900
    summary_res = await client.get(
        "/api/admin/expenses/summary?from_date=2026-10-01T00:00:00&to_date=2026-10-31T23:59:59",
        headers=headers,
    )
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["total_expenses"] == 900.0

    breakdown = {c["category"]: c["total"] for c in summary["expenses_by_category"]}
    assert breakdown.get("TEA_REFRESHMENTS") == 50.0
    assert breakdown.get("CONVEYANCE_AUTO") == 100.0
    assert breakdown.get("CLEANING_SUPPLIES") == 200.0
    assert breakdown.get("DAILY_LABOUR") == 200.0
    assert breakdown.get("OIL") == 350.0


@pytest.mark.asyncio
async def test_manager_expense_approval_workflow(client: AsyncClient, db_session: AsyncSession):
    """
    Test that an expense logged by a MANAGER is saved as PENDING_APPROVAL,
    does NOT affect P&L until approved by an OUTLET_ADMIN, and can be approved/rejected.
    """
    outlet = await create_test_outlet(db_session, slug="approval-outlet")
    admin = await create_test_user(db_session, outlet=outlet, email="admin@approval.com", role=RoleEnum.OUTLET_ADMIN)
    manager = await create_test_user(db_session, outlet=outlet, email="manager@approval.com", role=RoleEnum.MANAGER)
    admin_headers = get_auth_headers(admin, outlet)
    manager_headers = get_auth_headers(manager, outlet)

    # 1. Manager logs an expense of ₹250 for Maintenance / Repairs
    log_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "MAINTENANCE",
            "amount": 250.0,
            "payment_method": "CASH",
            "description": "Store door lock repair",
            "expense_date": "2026-10-16T11:00:00",
        },
        headers=manager_headers,
    )
    assert log_res.status_code == 201, log_res.text
    exp_data = log_res.json()
    assert exp_data["status"] == "PENDING_APPROVAL"
    assert exp_data["amount"] == 250.0
    exp_id = exp_data["id"]

    # 2. Check pending count endpoint
    cnt_res = await client.get("/api/admin/expenses/pending-count", headers=admin_headers)
    assert cnt_res.status_code == 200
    assert cnt_res.json()["pending_count"] == 1

    # 3. Check that it is NOT counted in total expenses yet
    summary_res = await client.get(
        "/api/admin/expenses/summary?from_date=2026-10-01T00:00:00&to_date=2026-10-31T23:59:59",
        headers=admin_headers,
    )
    assert summary_res.status_code == 200
    assert summary_res.json()["total_expenses"] == 0.0

    # 4. Admin approves the expense
    appr_res = await client.post(f"/api/admin/expenses/{exp_id}/approve", headers=admin_headers)
    assert appr_res.status_code == 200
    appr_data = appr_res.json()
    assert appr_data["status"] == "APPROVED"
    assert appr_data["approved_by_name"] is not None

    # 5. Now total expenses should reflect the ₹250
    summary_res2 = await client.get(
        "/api/admin/expenses/summary?from_date=2026-10-01T00:00:00&to_date=2026-10-31T23:59:59",
        headers=admin_headers,
    )
    assert summary_res2.status_code == 200
    assert summary_res2.json()["total_expenses"] == 250.0

    # 6. Manager logs a second expense of ₹500
    log2_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "MARKETING",
            "amount": 500.0,
            "payment_method": "UPI",
            "description": "Pamphlet distribution",
            "expense_date": "2026-10-16T14:00:00",
        },
        headers=manager_headers,
    )
    exp2_id = log2_res.json()["id"]

    # 7. Admin rejects the second expense
    rej_res = await client.post(
        f"/api/admin/expenses/{exp2_id}/reject",
        json={"rejection_reason": "Not approved in marketing budget"},
        headers=admin_headers,
    )
    assert rej_res.status_code == 200
    rej_data = rej_res.json()
    assert rej_data["status"] == "REJECTED"
    assert rej_data["rejection_reason"] == "Not approved in marketing budget"

    # 8. Total expenses remains 250 (rejected is not counted)
    summary_res3 = await client.get(
        "/api/admin/expenses/summary?from_date=2026-10-01T00:00:00&to_date=2026-10-31T23:59:59",
        headers=admin_headers,
    )
    assert summary_res3.json()["total_expenses"] == 250.0


@pytest.mark.asyncio
async def test_delete_expense_requires_admin_pin(client: AsyncClient, db_session: AsyncSession):
    """
    Test that deleting an expense requires a valid 4-digit admin security PIN.
    Without PIN -> 400 Bad Request
    With wrong PIN -> 401 Unauthorized
    With correct PIN -> 204 No Content and expense is deleted.
    """
    from app.core.security import hash_password

    outlet = await create_test_outlet(db_session, slug="del-exp-pin-outlet")
    admin = await create_test_user(db_session, outlet=outlet, email="admin_pin@test.com", role=RoleEnum.OUTLET_ADMIN)
    admin.pin_hash = hash_password("9876")
    await db_session.commit()

    admin_headers = get_auth_headers(admin, outlet)

    # 1. Create an expense record
    create_res = await client.post(
        "/api/admin/expenses",
        json={
            "category": "RENT",
            "amount": 1500.0,
            "payment_method": "CASH",
            "description": "Shop rent advance",
            "expense_date": "2026-10-16T10:00:00",
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    exp_id = create_res.json()["id"]

    # 2. Attempt delete without PIN -> 400 Bad Request
    del_no_pin = await client.delete(f"/api/admin/expenses/{exp_id}", headers=admin_headers)
    assert del_no_pin.status_code == 400
    assert "Admin security PIN is required" in del_no_pin.json()["detail"]

    # 3. Attempt delete with wrong PIN -> 401 Unauthorized
    del_wrong_pin = await client.delete(f"/api/admin/expenses/{exp_id}?pin=0000", headers=admin_headers)
    assert del_wrong_pin.status_code == 401
    assert "Invalid admin security PIN" in del_wrong_pin.json()["detail"]

    # 4. Attempt delete with correct PIN via query param -> 204 No Content
    del_ok = await client.delete(f"/api/admin/expenses/{exp_id}?pin=9876", headers=admin_headers)
    assert del_ok.status_code == 204

    # 5. Verify expense is deleted
    list_res = await client.get("/api/admin/expenses", headers=admin_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()["items"]) == 0





