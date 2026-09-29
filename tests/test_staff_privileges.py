"""
Tests for Staff & Team Management privilege hierarchy, activation/deactivation,
auto-clockout on deactivation, and two-step permanent deletion.
"""

import uuid
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.staff_punch_session import StaffPunchSession
from app.models.user import User


@pytest.mark.asyncio
async def test_manager_creation_and_escalation_restrictions(client, db_session: AsyncSession):
    """
    Verify that a MANAGER cannot create roles >= MANAGER (MANAGER, OUTLET_ADMIN, SUPERADMIN)
    and cannot escalate roles.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Privilege Test Outlet",
        slug=f"priv-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Store Manager",
        email="manager@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    db.add(manager)
    await db.commit()

    manager_token = create_access_token(user_id=manager.id, outlet_id=outlet_id, role=manager.role.value)
    headers = {"Authorization": f"Bearer {manager_token}"}

    # 1. Manager attempts to create another MANAGER -> 403
    resp = await client.post(
        "/api/staff",
        json={
            "name": "Peer Manager",
            "email": "peermanager@test.com",
            "role": "MANAGER",
            "password": "password123",
        },
        headers=headers,
    )
    assert resp.status_code == 403
    assert "permission to create staff with role 'MANAGER'" in resp.json()["detail"]

    # 2. Manager attempts to create OUTLET_ADMIN -> 403
    resp = await client.post(
        "/api/staff",
        json={
            "name": "Admin User",
            "email": "admin@test.com",
            "role": "OUTLET_ADMIN",
            "password": "password123",
        },
        headers=headers,
    )
    assert resp.status_code == 403

    # 3. Manager successfully creates CASHIER -> 201
    resp = await client.post(
        "/api/staff",
        json={
            "name": "Cashier One",
            "email": "cashier1@test.com",
            "role": "CASHIER",
            "password": "password123",
            "pin": "1234",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    cashier_id = resp.json()["id"]

    # 4. Manager attempts to escalate CASHIER to MANAGER via update -> 403
    resp = await client.put(
        f"/api/staff/{cashier_id}",
        json={"role": "MANAGER"},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "cannot assign the role 'MANAGER'" in resp.json()["detail"]

    # 5. Manager attempts to update own role to OUTLET_ADMIN -> 403
    resp = await client.put(
        f"/api/staff/{manager.id}",
        json={"role": "OUTLET_ADMIN"},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "Cannot change your own role" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_manager_cannot_modify_or_set_pin_of_peer_manager(client, db_session: AsyncSession):
    """
    Verify peer managers and admins are read-only to a manager.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Peer Test Outlet",
        slug=f"peer-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    mgr1 = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Manager Alice",
        email="alice@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    mgr2 = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Manager Bob",
        email="bob@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    db.add_all([mgr1, mgr2])
    await db.commit()

    alice_token = create_access_token(user_id=mgr1.id, outlet_id=outlet_id, role=mgr1.role.value)
    headers = {"Authorization": f"Bearer {alice_token}"}

    # Alice tries to update Bob's name -> 403
    resp = await client.put(
        f"/api/staff/{mgr2.id}",
        json={"name": "Bob Renamed"},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "permission to modify a staff member with role 'MANAGER'" in resp.json()["detail"]

    # Alice tries to set Bob's PIN -> 403
    resp = await client.post(
        f"/api/staff/{mgr2.id}/set-pin",
        json={"pin": "9999"},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "permission to set PIN for a staff member with role 'MANAGER'" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_staff_activation_deactivation_and_auto_punchout(client, db_session: AsyncSession):
    """
    Verify activation, deactivation, blocking self-deactivation,
    and automatic clock-out of open punch sessions upon deactivation.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Deactivation Test Outlet",
        slug=f"deact-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Manager Charlie",
        email="charlie@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Cashier Dave",
        email="dave@test.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    db.add_all([manager, cashier])
    await db.commit()

    # Cashier has an active punch session
    open_session = StaffPunchSession(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        staff_id=cashier.id,
        notes="Shift started normally",
    )
    db.add(open_session)
    await db.commit()

    manager_token = create_access_token(user_id=manager.id, outlet_id=outlet_id, role=manager.role.value)
    headers = {"Authorization": f"Bearer {manager_token}"}

    # 1. Manager tries to self-deactivate -> 400
    resp = await client.post(f"/api/staff/{manager.id}/deactivate", headers=headers)
    assert resp.status_code == 400
    assert "Cannot deactivate your own account" in resp.json()["detail"]

    # 2. Manager deactivates Cashier Dave -> 200
    resp = await client.post(f"/api/staff/{cashier.id}/deactivate", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "inactive"

    # 3. Verify Dave's punch session was automatically clocked out
    res = await db.execute(select(StaffPunchSession).where(StaffPunchSession.id == open_session.id))
    closed_session = res.scalar_one()
    assert closed_session.punch_out_at is not None
    assert "[Auto-closed upon account deactivation]" in (closed_session.notes or "")

    # 4. Manager activates Cashier Dave -> 200
    resp = await client.post(f"/api/staff/{cashier.id}/activate", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_permanent_deletion_two_step_workflow(client, db_session: AsyncSession):
    """
    Verify:
    1. Manager cannot permanently delete anyone (403).
    2. Admin cannot delete an active user (400 - must deactivate first).
    3. Admin cannot delete self (400).
    4. Admin can permanently delete a deactivated user (204).
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Delete Test Outlet",
        slug=f"del-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    admin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Super Admin",
        email="admin@test.com",
        role=RoleEnum.OUTLET_ADMIN,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Store Manager",
        email="manager@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Staff Member",
        email="staff@test.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    db.add_all([admin, manager, staff])
    await db.commit()

    manager_token = create_access_token(user_id=manager.id, outlet_id=outlet_id, role=manager.role.value)
    mgr_headers = {"Authorization": f"Bearer {manager_token}"}

    admin_token = create_access_token(user_id=admin.id, outlet_id=outlet_id, role=admin.role.value)
    adm_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Manager attempts permanent deletion -> 403
    resp = await client.delete(f"/api/staff/{staff.id}?permanent=true", headers=mgr_headers)
    assert resp.status_code == 403
    assert "Only an Outlet Admin or Superadmin can permanently delete staff members" in resp.json()["detail"]

    # 2. Admin attempts to delete an ACTIVE staff member -> 400
    resp = await client.delete(f"/api/staff/{staff.id}?permanent=true", headers=adm_headers)
    assert resp.status_code == 400
    assert "Only deactivated staff members can be permanently deleted" in resp.json()["detail"]

    # 3. Admin attempts to delete themselves -> 400
    resp = await client.delete(f"/api/staff/{admin.id}?permanent=true", headers=adm_headers)
    assert resp.status_code == 400
    assert "Cannot delete your own account" in resp.json()["detail"]

    # 4. Admin deactivates staff member
    resp = await client.post(f"/api/staff/{staff.id}/deactivate", headers=adm_headers)
    assert resp.status_code == 200

    # 5. Admin permanently deletes deactivated staff member -> 204 No Content
    resp = await client.delete(f"/api/staff/{staff.id}?permanent=true", headers=adm_headers)
    assert resp.status_code == 204

    # Verify user is completely removed from database
    res = await db.execute(select(User).where(User.id == staff.id))
    deleted_user = res.scalar_one_or_none()
    assert deleted_user is None


@pytest.mark.asyncio
async def test_superadmin_user_deletion_two_step_safeguard(client, db_session: AsyncSession):
    """
    Verify Superadmin /api/auth/users/{user_id} endpoint enforces two-step deletion:
    - Active user cannot be deleted (400)
    - Deactivated user can be deleted (204)
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="SA Delete Outlet",
        slug=f"sa-del-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    superadmin = User(
        id=uuid.uuid4(),
        name="Super Admin",
        email="sa@test.com",
        role=RoleEnum.SUPERADMIN,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    staff_user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Active Staff",
        email="activestaff@test.com",
        role=RoleEnum.FLOOR_STAFF,
        password_hash=hash_password("pass123"),
        status="active",
        is_active=True,
    )
    db.add_all([superadmin, staff_user])
    await db.commit()

    sa_token = create_access_token(user_id=superadmin.id, role=superadmin.role.value)
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # 1. Attempt to delete active user via superadmin endpoint -> 400
    resp = await client.delete(f"/api/auth/users/{staff_user.id}", headers=sa_headers)
    assert resp.status_code == 400
    assert "Only deactivated staff members can be permanently deleted" in resp.json()["detail"]

    # 2. Deactivate the user
    resp = await client.post(f"/api/staff/{staff_user.id}/deactivate", headers=sa_headers)
    assert resp.status_code == 200

    # 3. Now delete via superadmin endpoint -> 204
    resp = await client.delete(f"/api/auth/users/{staff_user.id}", headers=sa_headers)
    assert resp.status_code == 204

    # 4. Verify user record is gone
    res = await db.execute(select(User).where(User.id == staff_user.id))
    assert res.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_phone_number_length_validation(client, db_session: AsyncSession):
    """
    Verify phone number validation enforces 10 to 15 digits on creation.
    """
    from app.schemas.auth import RegisterRequest
    from app.schemas.staff import StaffCreate
    from pydantic import ValidationError

    # Under 10 digits fails
    with pytest.raises(ValidationError):
        StaffCreate(
            name="Test",
            email="test@test.com",
            phone="123456789",  # 9 digits
            password="password123",
        )

    with pytest.raises(ValidationError):
        RegisterRequest(
            name="Test",
            email="test@test.com",
            phone="987654321",  # 9 digits
            password="password123",
        )

    # Over 15 digits fails
    with pytest.raises(ValidationError):
        StaffCreate(
            name="Test",
            email="test@test.com",
            phone="5555555555555555",  # 16 digits
            password="password123",
        )

    with pytest.raises(ValidationError):
        RegisterRequest(
            name="Test",
            email="test@test.com",
            phone="+911234567890123456",  # 18 digits
            password="password123",
        )

    # 10 to 15 digits succeeds
    valid_staff = StaffCreate(
        name="Test",
        email="test@test.com",
        phone="+91 9876543210",  # 12 digits
        password="password123",
    )
    assert valid_staff.phone == "+91 9876543210"

    valid_reg = RegisterRequest(
        name="Test",
        email="test@test.com",
        phone="9876543210",  # 10 digits
        password="password123",
    )
    assert valid_reg.phone == "9876543210"


@pytest.mark.asyncio
async def test_delivery_boy_role_access_to_staff_or_admin_endpoints(client, db_session: AsyncSession):
    """
    Verify DELIVERY_BOY can access RequireStaffOrAdmin endpoints:
    - /api/admin/outlets/me
    - /api/admin/orders
    - /api/admin/categories
    - /api/admin/menu-items
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Delivery Test Outlet",
        slug=f"deliv-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    delivery_user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Delivery Agent",
        email=f"delivery_{uuid.uuid4().hex[:6]}@test.com",
        role=RoleEnum.DELIVERY_BOY,
        password_hash=hash_password("password123"),
        status="active",
        is_active=True,
    )
    db.add(delivery_user)
    await db.commit()

    token = create_access_token(user_id=delivery_user.id, outlet_id=outlet_id, role=delivery_user.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. /api/admin/outlets/me -> 200
    resp = await client.get("/api/admin/outlets/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == str(outlet_id)

    # 2. /api/admin/orders -> 200
    resp = await client.get("/api/admin/orders", headers=headers)
    assert resp.status_code == 200

    # 3. /api/admin/categories -> 200
    resp = await client.get("/api/admin/categories", headers=headers)
    assert resp.status_code == 200

    # 4. /api/admin/menu-items -> 200
    resp = await client.get("/api/admin/menu-items", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_deactivated_staff_hidden_from_pin_and_public_endpoints(client, db_session: AsyncSession):
    """
    Verify deactivated staff:
    1. Are excluded from /api/public/outlets/{outlet_id}/staff.
    2. Cannot authenticate via /api/staff/pin-switch (returns 401).
    3. Cannot authenticate via /api/staff/pin-login (returns 401).
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Deactivated Staff PIN Outlet",
        slug=f"deact-pin-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    # Active staff member
    active_staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Active Cashier",
        email=f"active_{uuid.uuid4().hex[:6]}@test.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("password123"),
        pin_hash=hash_password("1234"),
        status="active",
        is_active=True,
    )
    # Deactivated staff member
    deactivated_staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Inactive Cashier",
        email=f"inactive_{uuid.uuid4().hex[:6]}@test.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("password123"),
        pin_hash=hash_password("5678"),
        status="inactive",
        is_active=False,
    )
    db.add_all([active_staff, deactivated_staff])
    await db.commit()

    # 1. Public staff endpoint: only active staff returned
    resp = await client.get(f"/api/public/outlets/{outlet_id}/staff")
    assert resp.status_code == 200
    staff_ids = [s["id"] for s in resp.json()]
    assert str(active_staff.id) in staff_ids
    assert str(deactivated_staff.id) not in staff_ids

    # 2. PIN switch endpoint: active staff can switch
    active_token = create_access_token(user_id=active_staff.id, outlet_id=outlet_id, role=active_staff.role.value)
    headers = {"Authorization": f"Bearer {active_token}"}

    switch_active_resp = await client.post(
        "/api/staff/pin-switch",
        json={"staff_id": str(active_staff.id), "pin": "1234"},
        headers=headers,
    )
    assert switch_active_resp.status_code == 200

    # PIN switch endpoint: deactivated staff fails with 401
    switch_deact_resp = await client.post(
        "/api/staff/pin-switch",
        json={"staff_id": str(deactivated_staff.id), "pin": "5678"},
        headers=headers,
    )
    assert switch_deact_resp.status_code == 401
    assert "Invalid staff PIN" in switch_deact_resp.json()["detail"]

    # 3. Standalone PIN login: active succeeds, deactivated fails
    pin_login_active = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(active_staff.id), "pin": "1234"},
    )
    assert pin_login_active.status_code == 200

    pin_login_deact = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(deactivated_staff.id), "pin": "5678"},
    )
    assert pin_login_deact.status_code == 401


@pytest.mark.asyncio
async def test_manager_analytics_and_customer_services_restrictions(client, db_session: AsyncSession):
    """
    Verify Manager role:
    1. Has can_view_analytics == False in /api/staff/permissions.
    2. Does NOT have 'analytics' or 'customerservices' in allowed_sidebar_tabs.
    3. Is rejected with 403 Forbidden when accessing /api/analytics endpoints.
    4. Outlet Admin can still access /api/analytics endpoints.
    5. Manager can still manage staff, inventory, and menu without issues.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Manager Analytics Test Outlet",
        slug=f"mgr-analytics-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Store Manager",
        email=f"manager_{uuid.uuid4().hex[:6]}@test.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("password123"),
        status="active",
        is_active=True,
    )
    admin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Outlet Admin",
        email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
        role=RoleEnum.OUTLET_ADMIN,
        password_hash=hash_password("password123"),
        status="active",
        is_active=True,
    )
    db.add_all([manager, admin])
    await db.commit()

    mgr_token = create_access_token(user_id=manager.id, outlet_id=outlet_id, role=manager.role.value)
    adm_token = create_access_token(user_id=admin.id, outlet_id=outlet_id, role=admin.role.value)
    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
    adm_headers = {"Authorization": f"Bearer {adm_token}"}

    # 1. Check Manager permissions payload
    perm_resp = await client.get("/api/staff/permissions", headers=mgr_headers)
    assert perm_resp.status_code == 200
    perms = perm_resp.json()
    assert perms["can_view_analytics"] is False
    assert "analytics" not in perms["allowed_sidebar_tabs"]
    assert "customerservices" not in perms["allowed_sidebar_tabs"]
    assert "inventory" in perms["allowed_sidebar_tabs"]
    assert "menu" in perms["allowed_sidebar_tabs"]

    # 2. Manager calling /api/analytics/kpi-summary -> 403 Forbidden
    kpi_mgr_resp = await client.get("/api/analytics/kpi-summary", headers=mgr_headers)
    assert kpi_mgr_resp.status_code == 403
    assert "can_view_analytics" in kpi_mgr_resp.json()["detail"]

    # 3. Outlet Admin calling /api/analytics/kpi-summary -> 200 OK
    kpi_adm_resp = await client.get("/api/analytics/kpi-summary", headers=adm_headers)
    assert kpi_adm_resp.status_code == 200

    # 4. Verify Manager can still perform regular admin/management tasks
    # (RequireAdmin endpoints like inventory, menu items, categories, staff listing)
    cat_resp = await client.get("/api/admin/categories", headers=mgr_headers)
    assert cat_resp.status_code == 200

    menu_resp = await client.get("/api/admin/menu-items", headers=mgr_headers)
    assert menu_resp.status_code == 200

    staff_resp = await client.get("/api/staff", headers=mgr_headers)
    assert staff_resp.status_code == 200




