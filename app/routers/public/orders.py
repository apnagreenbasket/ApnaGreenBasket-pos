"""
Order public routes — checkout (both modes), claim paid (Mode B).
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.core.rate_limit import limiter
from app.dependencies import DBSession
from app.models.enums import OrderStatusEnum, PaymentModeEnum
from app.models.order import Order
from app.models.outlet import Outlet
from app.schemas.order import (
    CheckoutRequest,
    ClaimPaidRequest,
    OrderResponse,
    RazorpayCheckoutResponse,
    PayAfterMealCheckoutResponse,
)
from app.services.order_service import create_order
from app.services.payment_service import create_razorpay_order
from app.services.websocket_service import broadcast_verification_needed

router = APIRouter(prefix="/api/orders", tags=["orders"])
logger = logging.getLogger(__name__)


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
async def checkout(
    data: CheckoutRequest,
    db: DBSession,
):
    """
    Create an order and initiate payment.
    Total is computed server-side — NEVER trust a client-submitted total.

    Returns different response based on outlet's payment_mode:
    - RAZORPAY_GATEWAY: Razorpay order details for frontend checkout widget
    - PAY_AT_COUNTER: Pay At Counter confirmation response
    """
    # Look up outlet
    result = await db.execute(
        select(Outlet).where(Outlet.slug == data.outlet_slug)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outlet '{data.outlet_slug}' not found",
        )

    # Verify requested payment mode is enabled by outlet
    requested_mode = data.payment_mode
    allowed_modes = {outlet.payment_mode}
    if outlet.payment_mode == PaymentModeEnum.BOTH:
        allowed_modes = {PaymentModeEnum.RAZORPAY_GATEWAY, PaymentModeEnum.PAY_AT_COUNTER}

    if requested_mode not in allowed_modes:
        readable_mode = "Razorpay Gateway" if requested_mode == PaymentModeEnum.RAZORPAY_GATEWAY else "Pay At Counter"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{readable_mode} is not enabled for this outlet. Please try another payment method.",
        )

    # Create new order (server-side pricing)
    order = await create_order(db, data)

    if requested_mode == PaymentModeEnum.RAZORPAY_GATEWAY:
        # Mode A: Create Razorpay order
        rz_data = await create_razorpay_order(db, order, outlet)
        return RazorpayCheckoutResponse(
            order_id=order.id,
            razorpay_order_id=rz_data["razorpay_order_id"],
            amount=rz_data["amount"],
            currency=rz_data["currency"],
            key_id=rz_data["key_id"],
        )
    else:
        if order.is_auto_verified:
            order.status = OrderStatusEnum.PAYMENT_PENDING
            from app.services.inventory_service import process_order_auto_deduction
            await process_order_auto_deduction(db, order)
            from app.services.websocket_service import broadcast_new_order_paid
            await broadcast_new_order_paid(outlet.id, order.id)
        else:
            order.status = OrderStatusEnum.PENDING_VERIFICATION
            from app.services.websocket_service import broadcast_verification_needed
            await broadcast_verification_needed(
                outlet_id=outlet.id,
                order_id=order.id,
                basket_number=order.basket_number,
            )
        await db.flush()

        # Broadcast to staff dashboard session feed if session exists
        if order.session_id:
            from app.services.websocket_service import broadcast_session_changed
            await broadcast_session_changed(outlet.id, order.session_id, "UPDATED")

        return PayAfterMealCheckoutResponse(
            order_id=order.id,
            total_amount=order.total_amount,
        )


@router.post("/{order_id}/claim-paid")
@limiter.limit("3/minute")
async def claim_paid(
    order_id: uuid.UUID,
    request: Request,
    db: DBSession,
    body: ClaimPaidRequest | None = None,
):
    """
    Customer claims they've paid (Mode B only).
    Optionally records diner-entered 12-digit UTR transaction reference number.
    Triggers VERIFICATION_NEEDED WebSocket event to staff dashboard.
    """
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    if order.status != OrderStatusEnum.PENDING_VERIFICATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is not awaiting payment verification",
        )

    if body and body.utr_number and body.utr_number.strip():
        order.payment_reference = body.utr_number.strip()
        await db.flush()

    # Broadcast to staff dashboard
    await broadcast_verification_needed(
        outlet_id=order.outlet_id,
        order_id=order.id,
        basket_number=order.basket_number,
    )

    return {"message": "Verification request sent to staff", "order_id": str(order.id)}


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order_status(
    order_id: uuid.UUID,
    db: DBSession,
):
    """Public endpoint to check order status (for customer tracking)."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), joinedload(Order.outlet))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return order


@router.get("/{order_id}/receipt")
async def get_order_receipt(
    order_id: uuid.UUID,
    db: DBSession,
):
    """
    Public endpoint to fetch structured receipt data for paid orders.
    Returns store branding, itemized tax calculation breakdown, and IST timestamps.
    """
    from app.models.menu_item import MenuItem
    from app.services.receipt_service import calculate_order_receipt

    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    # Restrict receipt download to paid/completed orders only
    if order.status not in (OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt is only available for paid or completed orders.",
        )

    # Fetch Outlet
    outlet_result = await db.execute(
        select(Outlet).where(Outlet.id == order.outlet_id)
    )
    outlet = outlet_result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )

    # Fetch Menu Item Names
    item_ids = [item.menu_item_id for item in order.items]
    menu_items_map = {}
    if item_ids:
        items_result = await db.execute(
            select(MenuItem).where(MenuItem.id.in_(item_ids))
        )
        menu_items_map = {str(item.id): {"name": item.name, "image_url": item.image_url} for item in items_result.scalars().all()}

    receipt_data = calculate_order_receipt(order, outlet, menu_items_map)
    return receipt_data
