"""
Order service — creation, server-side pricing, state machine enforcement.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import OrderStatusEnum, is_valid_transition
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.schemas.order import CheckoutRequest, OrderItemRequest


def evaluate_verification_rules(
    outlet: Outlet,
    has_flagged_item: bool,
    total_amount: Decimal,
) -> bool:
    """
    Evaluate verification rules for an order.
    Returns True if manual staff verification is required, False if it can auto-skip.

    Rule Precedence:
    1. Flagged item check: A flagged product (is_verification_required=True) in cart ALWAYS requires verification.
    2. Amount cutoff check: If amount cutoff is configured and total_amount < cutoff, auto-skip verification.
    3. Default (no rules set, or total >= cutoff): Requires manual verification.
    """
    # Rule 1: Flagged item override
    if has_flagged_item:
        return True  # Requires verification!

    # Rule 2: Amount cutoff check
    cutoff = outlet.verification_amount_cutoff
    if cutoff is not None and total_amount < cutoff:
        return False  # Auto-skip verification!

    # Rule 3: Default
    return True


async def create_order(
    db: AsyncSession,
    data: CheckoutRequest,
) -> Order:
    """
    Create an order with server-side total computation.
    Total is computed from stored MenuItem/MenuItemVariant prices —
    NEVER trust a client-submitted total.
    """
    # Look up outlet by slug
    result = await db.execute(
        select(Outlet).where(Outlet.slug == data.outlet_slug)
    )
    outlet = result.scalar_one_or_none()
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outlet '{data.outlet_slug}' not found",
        )

    # Build order items with snapshot pricing
    order_items: list[OrderItem] = []
    total = Decimal("0.00")
    has_flagged_item = False

    for item_req in data.items:
        unit_price, mrp, is_verif, item_name, tax_rate, tax_category = await _compute_unit_price(
            db, outlet.id, item_req
        )
        m_item = await db.get(MenuItem, item_req.menu_item_id)
        inv_item = None
        if m_item and m_item.inventory_item_id:
            from app.models.inventory_item import InventoryItem
            inv_item = await db.get(InventoryItem, m_item.inventory_item_id)

        # Strict online order stock cap validation (non-staff self-checkout)
        if not getattr(item_req, "added_by_staff_id", None):
            if inv_item:
                req_qty = Decimal(str(item_req.quantity))
                if req_qty > inv_item.current_stock:
                    avail = max(Decimal("0.000"), inv_item.current_stock)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Only {avail} {inv_item.unit.value if hasattr(inv_item.unit, 'value') else inv_item.unit} of '{item_name}' remaining in stock.",
                    )

        if is_verif:
            has_flagged_item = True

        order_item = OrderItem(
            id=uuid.uuid4(),
            menu_item_id=item_req.menu_item_id,
            variant_id=item_req.variant_id,
            added_by_staff_id=getattr(item_req, "added_by_staff_id", None),
            quantity=item_req.quantity,
            selected_unit=getattr(item_req, "selected_unit", None),
            unit_price=unit_price,
            mrp=mrp,
            item_name=item_name,
            tax_rate=tax_rate,
            tax_category=tax_category,
            hsn_code=getattr(m_item, "hsn_code", None) or (getattr(inv_item, "hsn_code", None) if inv_item else None),
        )
        order_items.append(order_item)
        total += unit_price * item_req.quantity

    requires_verification = evaluate_verification_rules(
        outlet, has_flagged_item, total
    )

    order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        session_id=data.session_id,
        basket_number=data.basket_number,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        subtotal_amount=total,
        total_amount=total,
        status=OrderStatusEnum.PENDING,
        is_auto_verified=not requires_verification,
        payment_method=data.payment_mode.value,
        items=order_items,
    )

    db.add(order)
    await db.flush()

    # If linked to a session, refresh its expiry and clear its draft cart
    if data.session_id:
        from app.services.session_service import refresh_session_expiry
        from app.services.cart_service import clear_cart
        await refresh_session_expiry(db, data.session_id)
        await clear_cart(data.session_id)

    # Re-load with items relationship
    await db.refresh(order, ["items"])
    return order


async def _compute_unit_price(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    item_req: OrderItemRequest,
) -> tuple[Decimal, Decimal | None, bool, str, Decimal | None, str | None]:
    """
    Compute unit price, verification flag, item name, tax rate & category.
    unit_price = MenuItem.price + MenuItemVariant.price_delta (if variant selected)
    """
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_req.menu_item_id,
            MenuItem.outlet_id == outlet_id,
            MenuItem.is_available == True,  # noqa: E712
        )
    )
    menu_item = result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item {item_req.menu_item_id} not found or unavailable",
        )

    # Check outlet's evening price toggle
    from app.models.outlet import Outlet
    outlet_result = await db.execute(select(Outlet.evening_price_active).where(Outlet.id == outlet_id))
    evening_active = outlet_result.scalar_one_or_none() or False

    price = menu_item.resolve_price(evening_active)
    mrp = menu_item.mrp
    is_verif = getattr(menu_item, "is_verification_required", False)
    item_name = menu_item.name
    tax_rate = getattr(menu_item, "tax_rate", Decimal("0.00"))
    tax_category = getattr(menu_item, "tax_category", "GST 0%")

    if item_req.variant_id:
        var_result = await db.execute(
            select(MenuItemVariant).where(
                MenuItemVariant.id == item_req.variant_id,
                MenuItemVariant.menu_item_id == menu_item.id,
                MenuItemVariant.is_available == True,  # noqa: E712
            )
        )
        variant = var_result.scalar_one_or_none()
        if not variant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Variant {item_req.variant_id} not found or unavailable",
            )
        price += variant.price_delta
        if mrp is not None:
            mrp += variant.price_delta
        item_name = f"{menu_item.name} ({variant.name})"

    # Alternate unit multiplier (e.g. 1 pair = 2 pieces)
    if getattr(item_req, "selected_unit", None):
        from app.services.inventory_service import get_unit_conversion_multiplier
        unit_multiplier = get_unit_conversion_multiplier(item_req.selected_unit, menu_item=menu_item)
        price = price * unit_multiplier
        if mrp is not None:
            mrp = max(mrp * unit_multiplier, price)
        else:
            mrp = price

    return price, mrp, is_verif, item_name, tax_rate, tax_category


async def transition_order_status(
    db: AsyncSession,
    order: Order,
    new_status: OrderStatusEnum,
) -> Order:
    """
    Enforce the state machine — reject invalid transitions with 400.
    See architecture.md Diagram 3 for the valid transition graph.
    """
    if not is_valid_transition(order.status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status transition: {order.status.value} → {new_status.value}. "
                f"Allowed transitions from {order.status.value}: "
                f"{[s.value for s in __import__('app.models.enums', fromlist=['VALID_ORDER_TRANSITIONS']).VALID_ORDER_TRANSITIONS.get(order.status, set())]}"
            ),
        )

    old_status = order.status
    order.status = new_status
    await db.flush()

    # Trigger recipe-based inventory auto-deduction when order enters PAID, PAYMENT_PENDING, or COMPLETED
    if new_status in {OrderStatusEnum.PAID, OrderStatusEnum.PAYMENT_PENDING, OrderStatusEnum.COMPLETED} and old_status not in {OrderStatusEnum.PAID, OrderStatusEnum.PAYMENT_PENDING, OrderStatusEnum.COMPLETED}:
        from app.services.inventory_service import process_order_auto_deduction
        await process_order_auto_deduction(db, order)
        
        # Increment total_sold for menu items
        from sqlalchemy import update
        from app.models.menu_item import MenuItem
        for item in order.items:
            if item.menu_item_id:
                # Add integer portion of quantity (for fixed items) or floor/ceil? 
                # quantity is Numeric, so let's just use it, total_sold is int so we can cast
                # Actually, total_sold is an integer count. We can just add int(item.quantity)
                await db.execute(
                    update(MenuItem)
                    .where(MenuItem.id == item.menu_item_id)
                    .values(total_sold=MenuItem.total_sold + int(item.quantity))
                )

        try:
            from app.services.websocket_service import broadcast_catalog_updated
            await broadcast_catalog_updated(order.outlet_id, reason="ORDER_STATUS_AUTO_DEDUCTION", item_id=str(order.id))
        except Exception:
            pass

    # Trigger cancellation reversal if an already deducted order is cancelled or refunded
    if new_status in {OrderStatusEnum.CANCELLED, OrderStatusEnum.REFUNDED} and old_status in {OrderStatusEnum.PAID, OrderStatusEnum.PAYMENT_PENDING, OrderStatusEnum.COMPLETED}:
        from app.services.inventory_service import process_order_cancellation_reversal
        await process_order_cancellation_reversal(db, order)
        
        # Decrement total_sold for menu items
        from sqlalchemy import update
        from app.models.menu_item import MenuItem
        for item in order.items:
            if item.menu_item_id:
                await db.execute(
                    update(MenuItem)
                    .where(MenuItem.id == item.menu_item_id)
                    .values(total_sold=MenuItem.total_sold - int(item.quantity))
                )

        try:
            from app.services.websocket_service import broadcast_catalog_updated
            await broadcast_catalog_updated(order.outlet_id, reason="ORDER_STATUS_REVERSAL", item_id=str(order.id))
        except Exception:
            pass

    # Check if this transition completes the entire session
    if order.session_id:
        from app.services.session_service import check_session_completion
        await check_session_completion(db, order.session_id)

    return await get_order_with_items(db, order.id, order.outlet_id)


async def get_order_with_items(
    db: AsyncSession,
    order_id: uuid.UUID,
    outlet_id: uuid.UUID,
) -> Order:
    """Get an order by ID, scoped to an outlet, with items loaded."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.outlet_id == outlet_id)
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return order


async def purge_old_non_completed_orders(
    db: AsyncSession,
    outlet_id: uuid.UUID,
) -> int:
    """
    Purge non-completed orders older than 24 hours for an outlet.
    COMPLETED (Served) orders are NEVER deleted — kept forever for inventory & reporting.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import delete

    cutoff_utc = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)

    subquery = (
        select(Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.status != OrderStatusEnum.COMPLETED,
            Order.created_at < cutoff_utc,
        )
    )

    result = await db.execute(subquery)
    expired_ids = result.scalars().all()

    if not expired_ids:
        return 0

    await db.execute(
        delete(Order).where(Order.id.in_(expired_ids))
    )
    await db.flush()
    return len(expired_ids)
