"""
Razorpay webhook handler.
CRITICAL: Raw body is read and signature is verified BEFORE JSON parsing.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.core.rate_limit import limiter
from app.dependencies import DBSession
from app.services.payment_service import process_razorpay_webhook
from app.services.websocket_service import broadcast_new_order_paid

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/razorpay", status_code=status.HTTP_200_OK)
@limiter.limit("100/minute")
async def razorpay_webhook(request: Request, db: DBSession):
    """
    Handle Razorpay webhooks.

    CRITICAL ORDER OF OPERATIONS:
    1. Read raw body bytes
    2. Verify X-Razorpay-Signature against raw bytes
    3. ONLY THEN parse JSON
    4. Check idempotency (WebhookEvent.event_id)
    5. Process event
    6. Return 200 quickly — slow work in background
    """
    # Step 1: Read raw body bytes FIRST
    raw_body = await request.body()

    # Step 2: Get signature header
    signature = request.headers.get("X-Razorpay-Signature", "")

    # Steps 2-5: Verify, deduplicate, process
    result = await process_razorpay_webhook(db, raw_body, signature)

    # Step 6: Broadcast if payment was processed (do after DB write)
    if result.get("status") == "processed":
        # Extract order info for broadcast
        import json
        try:
            payload = json.loads(raw_body)
            if payload.get("event") == "order.paid":
                order_entity = (
                    payload.get("payload", {})
                    .get("order", {})
                    .get("entity", {})
                )
                notes = order_entity.get("notes", {})
                outlet_id = notes.get("outlet_id")
                order_id = notes.get("order_id")
                if outlet_id and order_id:
                    import uuid
                    await broadcast_new_order_paid(
                        uuid.UUID(outlet_id), uuid.UUID(order_id)
                    )
        except Exception:
            pass  # Don't fail the webhook response for broadcast errors

    return {"status": "ok"}
