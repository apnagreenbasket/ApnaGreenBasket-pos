"""
Webhook tests — signature verification, idempotency, state machine enforcement.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.config import get_settings
from app.models.enums import OrderStatusEnum
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.webhook_event import WebhookEvent
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
)

settings = get_settings()
settings.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_key_123"


def _make_webhook_payload(rz_order_id: str, event_id: str) -> dict:
    """Build a minimal Razorpay order.paid webhook payload."""
    return {
        "event": "order.paid",
        "event_id": event_id,
        "payload": {
            "order": {
                "entity": {
                    "id": rz_order_id,
                    "notes": {},
                }
            }
        },
    }


def _sign_payload(raw_body: bytes) -> str:
    """Generate valid HMAC signature for test payload."""
    return hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()


@pytest.mark.asyncio
class TestRazorpayWebhook:
    """Razorpay webhook handler tests."""

    async def test_invalid_signature_rejected(self, client, db_session):
        """Webhook with wrong signature must return 400."""
        payload = _make_webhook_payload("order_test123", "evt_test1")
        raw = json.dumps(payload).encode()

        resp = await client.post(
            "/api/webhooks/razorpay",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "invalid_signature_here",
            },
        )
        assert resp.status_code == 400

    async def test_valid_webhook_processed(self, client, db_session):
        """Valid signature + new event_id should process successfully."""
        outlet = await create_test_outlet(db_session)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)

        # Create an order with a Razorpay payment reference
        rz_order_id = "order_rz_test123"
        order = Order(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            basket_number="T1",
            total_amount=Decimal("10.00"),
            status=OrderStatusEnum.PENDING,
            payment_reference=rz_order_id,
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

        event_id = f"evt_{uuid.uuid4().hex[:12]}"
        payload = _make_webhook_payload(rz_order_id, event_id)
        raw = json.dumps(payload).encode()
        signature = _sign_payload(raw)

        resp = await client.post(
            "/api/webhooks/razorpay",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": signature,
            },
        )
        assert resp.status_code == 200

    async def test_duplicate_event_is_noop(self, client, db_session):
        """Same event_id sent twice must be idempotent — second call is no-op."""
        event_id = "evt_duplicate_test"

        # Pre-insert the webhook event
        we = WebhookEvent(
            id=uuid.uuid4(),
            provider="razorpay",
            event_id=event_id,
            payload={"event": "order.paid"},
        )
        db_session.add(we)
        await db_session.commit()

        payload = _make_webhook_payload("order_test", event_id)
        raw = json.dumps(payload).encode()
        signature = _sign_payload(raw)

        resp = await client.post(
            "/api/webhooks/razorpay",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": signature,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
