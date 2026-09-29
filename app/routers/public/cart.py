"""
Public cart router — server-synced live draft cart for active basket sessions.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies import DBSession
from app.models.basket_session import BasketSession
from app.models.enums import SessionStatusEnum
from app.services.cart_service import add_or_update_item, get_cart, remove_item
from app.services.websocket_service import broadcast_cart_updated

router = APIRouter(prefix="/api/sessions", tags=["cart"])


class CartItemInput(BaseModel):
    menu_item_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    quantity: Decimal = Field(default=Decimal("1.0"), description="Quantity to add (or negative to decrease)")


async def _verify_active_session(db: DBSession, session_id: uuid.UUID) -> BasketSession:
    session = await db.get(BasketSession, session_id)
    if not session or session.status != SessionStatusEnum.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active basket session not found or expired.",
        )
    return session


@router.get("/{session_id}/cart", status_code=status.HTTP_200_OK)
async def get_live_cart(
    session_id: uuid.UUID,
    db: DBSession,
):
    """
    Get current server-synced draft cart for an active session.
    Used on initial load, app focus, and WebSocket reconnection.
    """
    await _verify_active_session(db, session_id)
    cart_data = await get_cart(session_id)
    return cart_data


@router.post("/{session_id}/cart/items", status_code=status.HTTP_200_OK)
async def add_item_to_cart(
    session_id: uuid.UUID,
    data: CartItemInput,
    db: DBSession,
):
    """Add or update an item in the active session's live draft cart (by customer)."""
    session = await _verify_active_session(db, session_id)

    cart_data = await add_or_update_item(
        db=db,
        session_id=session_id,
        outlet_id=session.outlet_id,
        menu_item_id=data.menu_item_id,
        variant_id=data.variant_id,
        quantity=data.quantity,
        added_by="customer",
    )

    # Broadcast updated cart to WebSocket subscribers
    await broadcast_cart_updated(
        session_id=session.id,
        outlet_id=session.outlet_id,
        cart_data=cart_data,
    )

    return cart_data


@router.delete("/{session_id}/cart/items/{item_id}", status_code=status.HTTP_200_OK)
async def delete_item_from_cart(
    session_id: uuid.UUID,
    item_id: str,
    db: DBSession,
):
    """Remove a line item from the active session draft cart."""
    session = await _verify_active_session(db, session_id)
    cart_data = await remove_item(session_id=session_id, item_id=item_id)

    await broadcast_cart_updated(
        session_id=session.id,
        outlet_id=session.outlet_id,
        cart_data=cart_data,
    )

    return cart_data
