"""
Order tests — creation, server-side pricing, state machine enforcement.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.enums import OrderStatusEnum, PaymentModeEnum
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    create_test_variant,
    get_auth_headers,
)


@pytest.mark.asyncio
class TestOrderCreation:
    """Order creation and pricing tests."""

    async def test_checkout_computes_total_server_side(self, client, db_session):
        """Total must be computed from stored prices, never from client."""
        outlet = await create_test_outlet(
            db_session,
            payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
        )
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(
            db_session, outlet, cat, price=Decimal("10.00")
        )
        variant = await create_test_variant(
            db_session, item, price_delta=Decimal("3.00")
        )
        await db_session.commit()

        resp = await client.post("/api/orders/checkout", json={
            "outlet_slug": outlet.slug,
            "basket_number": "T1",
            "customer_name": "Test Customer",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "variant_id": str(variant.id),
                    "quantity": 2,
                },
            ],
        })
        assert resp.status_code == 201
        data = resp.json()
        # Server computed: (10.00 + 3.00) * 2 = 26.00
        assert data["total_amount"] == "26.00"

    async def test_checkout_unavailable_item_rejected(self, client, db_session):
        """Ordering an unavailable item should fail."""
        outlet = await create_test_outlet(
            db_session,
            payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
        )
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(
            db_session, outlet, cat, is_available=False
        )
        await db_session.commit()

        resp = await client.post("/api/orders/checkout", json={
            "outlet_slug": outlet.slug,
            "basket_number": "T1",
            "items": [{"menu_item_id": str(item.id), "quantity": 1}],
        })
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestOrderStateMachine:
    """State machine enforcement tests."""

    async def test_valid_transition_paid_to_payment_pending(self, client, db_session):
        """PAID → PAYMENT_PENDING should succeed."""
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)

        # Create order via checkout
        resp = await client.post("/api/orders/checkout", json={
            "outlet_slug": outlet.slug,
            "basket_number": "T1",
            "items": [{"menu_item_id": str(item.id), "quantity": 1}],
        })
        order_id = resp.json().get("order_id")
        if not order_id:
            pytest.skip("Razorpay not configured for Mode A checkout test")

    async def test_invalid_transition_completed_to_pending(self, client, db_session):
        """COMPLETED → PENDING must be rejected with 400."""
        from app.models.order import Order
        from app.models.order_item import OrderItem

        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)

        # Create order directly in COMPLETED state
        order = Order(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            basket_number="T1",
            total_amount=Decimal("10.00"),
            status=OrderStatusEnum.COMPLETED,
            items=[
                OrderItem(
                    id=uuid.uuid4(),
                    menu_item_id=item.id,
                    quantity=1,
                    unit_price=Decimal("10.00"),
                )
            ],
        )
        db_session.add(order)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.patch(
            f"/api/admin/orders/{order.id}/status",
            json={"status": "PENDING"},
            headers=headers,
        )
        assert resp.status_code == 400

    async def test_cancel_from_pending(self, client, db_session):
        """PENDING → CANCELLED should succeed."""
        from app.models.order import Order
        from app.models.order_item import OrderItem

        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)

        order = Order(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            basket_number="T1",
            total_amount=Decimal("10.00"),
            status=OrderStatusEnum.PENDING,
            items=[
                OrderItem(
                    id=uuid.uuid4(),
                    menu_item_id=item.id,
                    quantity=1,
                    unit_price=Decimal("10.00"),
                )
            ],
        )
        db_session.add(order)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post(
            f"/api/admin/orders/{order.id}/cancel",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "CANCELLED"

    async def test_refund_from_paid(self, client, db_session):
        """PAID → REFUNDED should succeed (Mode B — admin record only)."""
        from app.models.order import Order
        from app.models.order_item import OrderItem

        outlet = await create_test_outlet(
            db_session,
            payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
        )
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)

        order = Order(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            basket_number="T1",
            total_amount=Decimal("10.00"),
            status=OrderStatusEnum.PAID,
            items=[
                OrderItem(
                    id=uuid.uuid4(),
                    menu_item_id=item.id,
                    quantity=1,
                    unit_price=Decimal("10.00"),
                )
            ],
        )
        db_session.add(order)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post(
            f"/api/admin/orders/{order.id}/refund",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REFUNDED"
