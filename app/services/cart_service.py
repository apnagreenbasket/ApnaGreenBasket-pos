"""
Cart service — server-synced live draft cart in Redis.
Supports real-time staff assistance, customer items, and session expiry TTL.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant

DEFAULT_CART_TTL_SECONDS = 1800  # 30 minutes


def _cart_key(session_id: uuid.UUID) -> str:
    return f"cart:{session_id}"


async def get_cart(session_id: uuid.UUID) -> dict[str, Any]:
    """Retrieve active draft cart state from Redis."""
    r = await get_redis()
    raw = await r.get(_cart_key(session_id))
    if not raw:
        return {
            "session_id": str(session_id),
            "items": [],
            "subtotal": 0.0,
            "item_count": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)
    return data


async def _save_cart(session_id: uuid.UUID, cart_data: dict[str, Any], ttl: int = DEFAULT_CART_TTL_SECONDS) -> None:
    """Save draft cart to Redis with TTL."""
    r = await get_redis()
    cart_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Recalculate totals
    subtotal = Decimal("0.00")
    total_qty = Decimal("0.00")
    for item in cart_data.get("items", []):
        qty = Decimal(str(item.get("quantity", 1)))
        price = Decimal(str(item.get("unit_price", 0)))
        line_total = price * qty
        item["line_total"] = float(line_total)
        subtotal += line_total
        total_qty += qty

    cart_data["subtotal"] = float(subtotal)
    cart_data["item_count"] = float(total_qty)

    payload = json.dumps(cart_data, default=str)
    await r.set(_cart_key(session_id), payload, ex=ttl)


async def add_or_update_item(
    db: AsyncSession,
    session_id: uuid.UUID,
    outlet_id: uuid.UUID,
    menu_item_id: uuid.UUID,
    variant_id: uuid.UUID | None = None,
    quantity: Decimal = Decimal("1.0"),
    added_by: str = "customer",  # "customer" or "staff"
    staff_id: uuid.UUID | None = None,
    staff_name: str | None = None,
) -> dict[str, Any]:
    """Add or update an item in the session's live draft cart."""
    menu_item = await db.get(MenuItem, menu_item_id)
    if not menu_item or menu_item.outlet_id != outlet_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu item {menu_item_id} not found in this outlet.",
        )

    # Check outlet's evening price toggle
    from app.models.outlet import Outlet
    outlet_result = await db.execute(select(Outlet.evening_price_active).where(Outlet.id == outlet_id))
    evening_active = outlet_result.scalar_one_or_none() or False

    price = Decimal(str(menu_item.resolve_price(evening_active)))
    item_name = menu_item.name

    if variant_id:
        variant = await db.get(MenuItemVariant, variant_id)
        if variant and variant.menu_item_id == menu_item.id:
            price += Decimal(str(variant.price_delta))
            item_name = f"{item_name} ({variant.name})"

    cart_data = await get_cart(session_id)
    items = cart_data.get("items", [])

    # Check if item already exists in cart (matching menu_item_id and variant_id)
    existing_item = None
    for item in items:
        if item.get("menu_item_id") == str(menu_item_id) and item.get("variant_id") == (str(variant_id) if variant_id else None):
            existing_item = item
            break

    if existing_item:
        current_qty = Decimal(str(existing_item.get("quantity", 0)))
        new_qty = current_qty + quantity
        if new_qty <= Decimal("0"):
            items.remove(existing_item)
        else:
            existing_item["quantity"] = float(new_qty)
            existing_item["unit_price"] = float(price)
            if added_by == "staff":
                existing_item["added_by"] = "staff"
                existing_item["added_by_staff_id"] = str(staff_id) if staff_id else None
                existing_item["added_by_staff_name"] = staff_name or "Staff"
    else:
        if quantity > Decimal("0"):
            item_id = str(uuid.uuid4())
            new_item = {
                "item_id": item_id,
                "menu_item_id": str(menu_item_id),
                "variant_id": str(variant_id) if variant_id else None,
                "name": item_name,
                "unit_price": float(price),
                "quantity": float(quantity),
                "line_total": float(price * quantity),
                "is_verification_required": bool(menu_item.is_verification_required),
                "added_by": added_by,
                "added_by_staff_id": str(staff_id) if staff_id else None,
                "added_by_staff_name": staff_name if added_by == "staff" else None,
                "added_at": datetime.now(timezone.utc).isoformat(),
            }
            items.append(new_item)

    cart_data["items"] = items
    await _save_cart(session_id, cart_data)
    return cart_data


async def remove_item(session_id: uuid.UUID, item_id: str) -> dict[str, Any]:
    """Remove a line item from the session draft cart."""
    cart_data = await get_cart(session_id)
    items = cart_data.get("items", [])
    cart_data["items"] = [i for i in items if i.get("item_id") != item_id]
    await _save_cart(session_id, cart_data)
    return cart_data


async def clear_cart(session_id: uuid.UUID) -> None:
    """Clear draft cart from Redis (e.g. after order checkout)."""
    r = await get_redis()
    await r.delete(_cart_key(session_id))
