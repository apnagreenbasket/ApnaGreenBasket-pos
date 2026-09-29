"""
Payment service — Razorpay integration + UPI deep link generation.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from decimal import Decimal
from urllib.parse import quote

import razorpay
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.enums import OrderStatusEnum
from app.models.order import Order
from app.models.outlet import Outlet
from app.models.webhook_event import WebhookEvent

async def create_razorpay_order(
    db: AsyncSession,
    order: Order,
    outlet: Outlet,
) -> dict:
    """
    Create a Razorpay order with Route transfers.
    Returns dict with razorpay_order_id, amount (paise), key_id.
    """
    client = _get_razorpay_client()

    # Convert Decimal to paise (int)
    amount_paise = int(order.total_amount * 100)

    order_data: dict = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": str(order.id),
        "notes": {
            "outlet_id": str(outlet.id),
            "order_id": str(order.id),
        },
    }

    # Add Route transfer if outlet has a Razorpay account
    if outlet.razorpay_account_id:
        order_data["transfers"] = [
            {
                "account": outlet.razorpay_account_id,
                "amount": amount_paise,
                "currency": "INR",
                "on_hold": 0,
            }
        ]

    try:
        rz_order = client.order.create(data=order_data)
    except Exception as e:
        # If transfers are invalid (e.g. test mode/unlinked account), retry without transfers
        if "transfers" in order_data:
            import logging
            logging.getLogger(__name__).warning(
                "Razorpay transfer failed, retrying without route transfers for order %s: %s",
                order.id,
                e
            )
            del order_data["transfers"]
            try:
                rz_order = client.order.create(data=order_data)
            except Exception as retry_err:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Razorpay order creation failed: {str(retry_err)}",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Razorpay order creation failed: {str(e)}",
            )

    # Store payment reference
    order.payment_reference = rz_order["id"]
    await db.flush()

    return {
        "razorpay_order_id": rz_order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
    }


def verify_razorpay_signature(raw_body: bytes, signature: str) -> bool:
    """
    Verify Razorpay webhook signature against raw body bytes.
    CRITICAL: Must be called BEFORE any JSON parsing.
    """
    settings = get_settings()
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return False

    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


async def process_razorpay_webhook(
    db: AsyncSession,
    raw_body: bytes,
    signature: str,
) -> dict:
    """
    Handle Razorpay webhook.
    1. Verify signature against raw bytes BEFORE parsing JSON
    2. Check idempotency (WebhookEvent.event_id)
    3. Process order.paid event
    """
    # Step 1: Verify signature on raw bytes
    if not verify_razorpay_signature(raw_body, signature):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        )

    # Step 2: Parse JSON (only AFTER signature verification)
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    event_id = payload.get("event_id") or payload.get("id", "")
    event_type = payload.get("event", "")

    # Step 3: Idempotency check
    existing = await db.execute(
        select(WebhookEvent).where(WebhookEvent.event_id == event_id)
    )
    if existing.scalar_one_or_none():
        # Already processed — return 200 (no-op, Razorpay retries)
        return {"status": "already_processed"}

    # Step 4: Insert webhook event for idempotency
    webhook_event = WebhookEvent(
        id=uuid.uuid4(),
        provider="razorpay",
        event_id=event_id,
        payload=payload,
    )
    db.add(webhook_event)

    # Step 5: Process based on event type
    if event_type == "order.paid":
        await _handle_order_paid(db, payload)

    await db.flush()
    return {"status": "processed"}


async def _handle_order_paid(db: AsyncSession, payload: dict) -> None:
    """
    Handle order.paid webhook event.
    Look up Order by Razorpay order ID, verify state machine, update to PAID.
    """
    from app.models.enums import is_valid_transition

    rz_order_id = (
        payload.get("payload", {})
        .get("order", {})
        .get("entity", {})
        .get("id", "")
    )

    if not rz_order_id:
        return  # Can't process without order ID

    result = await db.execute(
        select(Order).where(Order.payment_reference == rz_order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        return  # Order not found — log and skip

    target_status = OrderStatusEnum.COMPLETED if order.is_auto_verified else OrderStatusEnum.PENDING_VERIFICATION

    # Enforce state machine: only transition if current status is a valid predecessor
    if not is_valid_transition(order.status, target_status):
        return  # Invalid transition — skip silently

    order.status = target_status
    await db.flush()


# ── Mode B: Direct UPI Deep Link ────────────────────────────────────────


from urllib.parse import parse_qs, quote, urlparse
import logging
import re

logger = logging.getLogger(__name__)

# Safe allowlist of merchant parameters from scanned QR code.
# EXCLUDES 'sign' (stale after overriding am/tr), 'mode' (we set our own),
# 'am', 'tr', 'tn', 'cu' (we inject these dynamically per order).
ALLOWED_MERCHANT_PARAMS: set[str] = {"pa", "pn", "mc", "orgid", "purpose"}

# Basic VPA format: handle@psp (e.g. merchant@paytm, shop.owner@ybl)
VPA_PATTERN = re.compile(r"^[a-zA-Z0-9.\-_]+@[a-zA-Z][a-zA-Z0-9]*$")


def _encode_upi_param(key: str, value: str) -> str:
    """
    Encode a single UPI parameter value per NPCI spec (RFC 3986 percent-encoding).
    Special handling: '@' in 'pa' (payee VPA) must NOT be percent-encoded,
    as UPI apps expect the literal '@' character.
    """
    encoded = quote(value, safe="")
    if key == "pa":
        encoded = encoded.replace("%40", "@")
    return encoded


def generate_upi_deep_link(
    outlet_name: str,
    total_amount: Decimal,
    order_id: uuid.UUID,
    raw_upi_payload: str,
) -> str:
    """
    Generate a simple, browser-compatible static P2P UPI deep link.
    By omitting 'am' (amount) and 'tr' (transaction reference), we prevent
    banks from blocking the browser-initiated redirect on personal VPAs.
    The customer will enter the payment amount manually in their UPI app.
    """
    if not raw_upi_payload or not raw_upi_payload.strip():
        raise ValueError("Merchant QR scanner payload is empty or unconfigured")

    payload_str = raw_upi_payload.strip()
    if "upi://pay" not in payload_str:
        raise ValueError("Invalid merchant QR payload: string must begin with 'upi://pay'")

    params: dict[str, str] = {}

    try:
        parsed = urlparse(payload_str)
        query = parse_qs(parsed.query)
        for k, v in query.items():
            clean_k = k.lower().strip()
            if clean_k in ALLOWED_MERCHANT_PARAMS and v and v[0]:
                params[clean_k] = v[0]
    except (ValueError, TypeError, AttributeError) as err:
        logger.warning("Failed to parse merchant QR payload for order %s: %s", order_id, str(err))
        raise ValueError(f"Malformed merchant QR scanner payload: {err}") from err

    # Validate payee VPA (pa) — NPCI Mandatory
    if "pa" not in params or not params["pa"].strip():
        logger.warning("Merchant QR payload for order %s contains no payee VPA ('pa')", order_id)
        raise ValueError("Merchant QR scanner payload is missing payee VPA ('pa') parameter")

    vpa = params["pa"].strip()
    if not VPA_PATTERN.match(vpa):
        logger.warning("Invalid VPA format '%s' for order %s", vpa, order_id)
        raise ValueError(f"Invalid payee VPA format: '{vpa}' — expected format: handle@psp")

    # Set merchant fallback name & MCC if not present in payload
    clean_name = "".join(c for c in outlet_name if c.isalnum() or c == " ").strip() or "Outlet Order"
    if "pn" not in params:
        params["pn"] = clean_name
    
    # Only keep the minimum clean static parameters to guarantee P2P compatibility
    static_params = {
        "pa": params["pa"],
        "pn": params.get("pn", clean_name),
        "cu": "INR"
    }

    # Build query string with proper per-field encoding
    query_parts = [f"{k}={_encode_upi_param(k, v)}" for k, v in static_params.items()]
    final_link = "upi://pay?" + "&".join(query_parts)

    logger.info("Constructed static UPI deep link for order %s: %s", order_id, final_link)
    return final_link


# ── Refunds ──────────────────────────────────────────────────────────────


async def create_razorpay_refund(
    db: AsyncSession,
    order: Order,
) -> dict:
    """
    Create a Razorpay refund for a paid order (Mode A only).
    Returns the refund details from Razorpay.
    """
    if not order.payment_reference:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No payment reference found — cannot refund",
        )

    client = _get_razorpay_client()

    # First, get the payment ID from the Razorpay order
    try:
        payments = client.order.payments(order.payment_reference)
        if not payments.get("items"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No payments found for this order",
            )
        payment_id = payments["items"][0]["id"]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch Razorpay payment: {str(e)}",
        )

    # Create refund
    amount_paise = int(order.total_amount * 100)
    try:
        refund = client.payment.refund(
            payment_id,
            {
                "amount": amount_paise,
                "notes": {
                    "order_id": str(order.id),
                    "reason": "Customer refund",
                },
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Razorpay refund failed: {str(e)}",
        )

    return refund
