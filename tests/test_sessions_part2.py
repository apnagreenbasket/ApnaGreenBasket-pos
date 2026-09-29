"""
Part 2 tests — basket locking, session duration, extension, abandoned carts,
manual staff termination, and abandoned cart conversion.
"""

from __future__ import annotations

import pytest
from decimal import Decimal
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)
from app.models.enums import RoleEnum


@pytest.mark.asyncio
class TestPart2Sessions:
    """Part 2 Basket QR & Customer Session System tests."""

    async def test_basket_locking_same_name_resumes(self, client, db_session):
        """Scanning same basket with exact same name resumes active session."""
        outlet = await create_test_outlet(db_session)
        await db_session.commit()

        # First scan
        resp1 = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "5",
            "customer_name": "Alice Green",
            "customer_phone": "9876543210",
        })
        assert resp1.status_code == 200
        data1 = resp1.json()
        session_id_1 = data1["session_id"]

        # Rescan same basket with same name (case-insensitive normalized)
        resp2 = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "5",
            "customer_name": "alice green",
        })
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["session_id"] == session_id_1

    async def test_basket_locking_different_name_blocked(self, client, db_session):
        """Scanning a basket already in use by another customer returns 409 Conflict."""
        outlet = await create_test_outlet(db_session)
        await db_session.commit()

        # Alice starts session at basket 5
        resp1 = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "5",
            "customer_name": "Alice Green",
        })
        assert resp1.status_code == 200

        # Bob tries to start session at same basket 5
        resp2 = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "5",
            "customer_name": "Bob Smith",
        })
        assert resp2.status_code == 409
        assert "currently in use by Alice Green" in resp2.json()["detail"]

    async def test_outlet_session_duration_setting(self, client, db_session):
        """Admin can configure session_duration_minutes in outlet settings."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Update duration to 45 mins
        resp = await client.patch("/api/admin/outlets/me", json={
            "session_duration_minutes": 45,
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["session_duration_minutes"] == 45

        # New session gets 45 min duration
        resp_sess = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "10",
            "customer_name": "Charlie",
        })
        assert resp_sess.status_code == 200
        assert resp_sess.json()["session_duration_minutes"] == 45

    async def test_extend_session(self, client, db_session):
        """Customer can extend an active session."""
        outlet = await create_test_outlet(db_session)
        await db_session.commit()

        start_res = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "12",
            "customer_name": "David",
        })
        session_id = start_res.json()["session_id"]
        old_expiry = start_res.json()["expires_at"]

        # Extend session
        ext_res = await client.post(f"/api/sessions/{session_id}/extend")
        assert ext_res.status_code == 200
        new_expiry = ext_res.json()["expires_at"]
        assert new_expiry >= old_expiry

    async def test_abandon_cart_push_and_conversion(self, client, db_session):
        """Customer pushes local cart on expiry -> Admin sees abandoned cart and converts to bill."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat, name="Fresh Apples", price=Decimal("120.00"))
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        start_res = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "3",
            "customer_name": "Eve",
            "customer_phone": "9998887776",
        })
        session_id = start_res.json()["session_id"]

        # Push local cart on expiry
        push_res = await client.post(f"/api/sessions/{session_id}/abandon-cart", json={
            "items": [{
                "menu_item_id": str(item.id),
                "name": "Fresh Apples",
                "quantity": 2.5,
                "unit_price": 120.00,
                "pricing_mode": "WEIGHT_BASED",
                "unit_label": "kg",
            }],
            "total_estimate": 300.00,
        })
        assert push_res.status_code == 200
        cart_id = push_res.json()["abandoned_cart_id"]
        assert cart_id is not None

        # Admin lists abandoned carts
        list_res = await client.get("/api/admin/sessions/abandoned-carts", headers=headers)
        assert list_res.status_code == 200
        carts = list_res.json()
        assert len(carts) >= 1
        found_cart = next(c for c in carts if c["id"] == cart_id)
        assert found_cart["customer_name"] == "Eve"
        assert found_cart["basket_number"] == "3"
        assert found_cart["total_estimate"] == 300.00

        # Admin count
        count_res = await client.get("/api/admin/sessions/abandoned-carts/count", headers=headers)
        assert count_res.status_code == 200
        assert count_res.json()["count"] >= 1

        # Test Dismiss action on a second cart
        start_res2 = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "4",
            "customer_name": "Bob",
        })
        session_id_2 = start_res2.json()["session_id"]
        push_res2 = await client.post(f"/api/sessions/{session_id_2}/abandon-cart", json={
            "items": [{"menu_item_id": str(item.id), "name": "Fresh Apples", "quantity": 1, "unit_price": 120.00}],
            "total_estimate": 120.00,
        })
        cart_id_2 = push_res2.json()["abandoned_cart_id"]

        # Dismiss second cart
        dismiss_res = await client.post(f"/api/admin/sessions/abandoned-carts/{cart_id_2}/dismiss", headers=headers)
        assert dismiss_res.status_code == 200
        assert dismiss_res.json()["status"] == "dismissed"

        # Admin converts first abandoned cart to manual bill
        convert_res = await client.post(f"/api/admin/sessions/abandoned-carts/{cart_id}/convert", headers=headers)
        assert convert_res.status_code == 200
        assert convert_res.json()["status"] == "converted"
        assert convert_res.json()["order_id"] is not None

        # After convert and dismiss, count for active abandoned carts drops
        count_res2 = await client.get("/api/admin/sessions/abandoned-carts/count", headers=headers)
        assert count_res2.status_code == 200
        assert count_res2.json()["count"] == 0

    async def test_manual_session_termination(self, client, db_session):
        """Staff/Manager can manually terminate an active session."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        start_res = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "7",
            "customer_name": "Frank",
        })
        session_id = start_res.json()["session_id"]

        # Admin lists active sessions
        active_res = await client.get("/api/admin/sessions", headers=headers)
        assert active_res.status_code == 200
        assert any(s["id"] == session_id for s in active_res.json())

        # Admin terminates session
        term_res = await client.post(f"/api/admin/sessions/{session_id}/terminate", json={
            "reason": "Customer left store without completing basket",
        }, headers=headers)
        assert term_res.status_code == 200
        assert term_res.json()["status"] == "terminated"

        # Check status endpoint shows non-active
        status_res = await client.get(f"/api/sessions/{session_id}")
        assert status_res.status_code == 200
        assert status_res.json()["is_active"] is False
        assert status_res.json()["status"] == "TERMINATED"

    async def test_staff_add_items_to_active_session(self, client, db_session):
        """Staff can assist a customer by adding items directly to an active basket session."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat, name="Organic Milk", price=Decimal("60.00"))
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Customer starts session at Basket 9
        start_res = await client.post("/api/sessions/start", json={
            "outlet_slug": outlet.slug,
            "basket_number": "9",
            "customer_name": "Grace",
        })
        assert start_res.status_code == 200
        session_id = start_res.json()["session_id"]

        # Staff assists Grace by adding 2 packs of Organic Milk from staff console
        assist_res = await client.post(
            f"/api/admin/sessions/{session_id}/add-items",
            json={
                "items": [{
                    "menu_item_id": str(item.id),
                    "quantity": 2,
                }],
            },
            headers=headers,
        )
        assert assist_res.status_code == 201
        data = assist_res.json()
        assert data["session_id"] == session_id
        assert data["basket_number"] == "9"
        assert data["customer_name"] == "Grace"
        assert data["added_items_count"] == 1
        assert float(data["total_amount"]) == 120.00
        assert data["added_by_staff_id"] == str(admin.id)

        # Check customer live cart returns the new staff-assisted items
        cart_res = await client.get(f"/api/sessions/{session_id}/cart")
        assert cart_res.status_code == 200
        cart = cart_res.json()
        assert len(cart["items"]) == 1
        assert cart["items"][0]["added_by"] == "staff"
        assert float(cart["subtotal"]) == 120.00

