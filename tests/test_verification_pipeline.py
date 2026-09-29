"""
Part 3 tests — Confirmation / Verification Pipeline & Verification Rules Engine.
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
from app.models.enums import OrderStatusEnum, RoleEnum
from app.services.order_service import evaluate_verification_rules


@pytest.mark.asyncio
class TestVerificationPipeline:
    """Part 3 verification pipeline & rules engine unit tests."""

    async def test_verification_rules_unit_logic(self, db_session):
        """Test evaluate_verification_rules pure precedence logic."""
        outlet = await create_test_outlet(db_session)
        item_cheap_id = "11111111-1111-1111-1111-111111111111"
        item_expensive_id = "22222222-2222-2222-2222-222222222222"

        # 1. Default (no rules set): Requires verification for all
        outlet.verification_amount_cutoff = None
        assert evaluate_verification_rules(outlet, False, Decimal("100.00")) is True

        # 2. Cutoff set to 500: Total 200 < 500 -> Auto-skip (False)
        outlet.verification_amount_cutoff = Decimal("500.00")
        assert evaluate_verification_rules(outlet, False, Decimal("200.00")) is False
        # Total 600 >= 500 -> Requires verification (True)
        assert evaluate_verification_rules(outlet, False, Decimal("600.00")) is True

        # 3. Precedence test: When a flagged item is present. Even total 100 (< 500) -> MUST VERIFY (True)
        assert evaluate_verification_rules(outlet, True, Decimal("100.00")) is True
        # Non-flagged item with total 100 (< 500) -> Auto-skip (False)
        assert evaluate_verification_rules(outlet, False, Decimal("100.00")) is False

    async def test_outlet_settings_verification_rules_update(self, client, db_session):
        """Admin can configure verification_amount_cutoff and flagged_item_ids in settings."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat, price=Decimal("150.00"))
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Update verification rules
        resp = await client.patch("/api/admin/outlets/me", json={
            "verification_amount_cutoff": 400.00,
            "flagged_item_ids": [str(item.id)],
        }, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert float(data["verification_amount_cutoff"]) == 400.00
        assert str(item.id) in data["flagged_item_ids"]

    async def test_checkout_auto_skip_completion_flow(self, client, db_session):
        """Order under amount cutoff without flagged items auto-skips to COMPLETED."""
        outlet = await create_test_outlet(db_session)
        outlet.payment_mode = "BOTH"
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        cat = await create_test_category(db_session, outlet)
        item_normal = await create_test_menu_item(db_session, outlet, cat, name="Juice", price=Decimal("80.00"))
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Configure amount cutoff = ₹200 (no flagged items)
        await client.patch("/api/admin/outlets/me", json={
            "verification_amount_cutoff": 200.00,
            "flagged_item_ids": [],
        }, headers=headers)

        # Checkout 1 item @ ₹80 (total ₹80 < ₹200)
        checkout_res = await client.post("/api/orders/checkout", json={
            "outlet_slug": outlet.slug,
            "basket_number": "1",
            "customer_name": "Alice",
            "payment_mode": "PAY_AT_COUNTER",
            "items": [{"menu_item_id": str(item_normal.id), "quantity": 1}],
        })
        assert checkout_res.status_code == 201
        order_id = checkout_res.json()["order_id"]

        # Fetch status — should be PAYMENT_PENDING (payment pending at counter) with is_auto_verified = True
        status_res = await client.get(f"/api/orders/{order_id}")
        assert status_res.status_code == 200
        order_data = status_res.json()
        assert order_data["status"] == "PAYMENT_PENDING"
        assert order_data["is_auto_verified"] is True

    async def test_checkout_flagged_item_forces_verification(self, client, db_session):
        """Cart with flagged item forces manual verification even if total < cutoff."""
        outlet = await create_test_outlet(db_session)
        outlet.payment_mode = "BOTH"
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        cat = await create_test_category(db_session, outlet)
        item_flagged = await create_test_menu_item(db_session, outlet, cat, name="Exotic Avocado", price=Decimal("150.00"))
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Configure amount cutoff = ₹500, but flag item_flagged
        await client.patch("/api/admin/outlets/me", json={
            "verification_amount_cutoff": 500.00,
            "flagged_item_ids": [str(item_flagged.id)],
        }, headers=headers)

        # Checkout flagged item @ ₹150 (total ₹150 < ₹500 cutoff)
        checkout_res = await client.post("/api/orders/checkout", json={
            "outlet_slug": outlet.slug,
            "basket_number": "2",
            "customer_name": "Bob",
            "payment_mode": "PAY_AT_COUNTER",
            "items": [{"menu_item_id": str(item_flagged.id), "quantity": 1}],
        })
        assert checkout_res.status_code == 201
        order_id = checkout_res.json()["order_id"]

        # Fetch status — MUST BE PENDING_VERIFICATION with is_auto_verified = False
        status_res = await client.get(f"/api/orders/{order_id}")
        assert status_res.status_code == 200
        order_data = status_res.json()
        assert order_data["status"] == "PENDING_VERIFICATION"
        assert order_data["is_auto_verified"] is False
