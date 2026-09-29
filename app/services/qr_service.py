"""
QR Token Service — cryptographically random QR code token generation and resolution for smart baskets.
"""

from __future__ import annotations

import secrets
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outlet import Outlet
from app.models.qr_token import BasketQrToken


async def get_or_create_qr_token(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    basket_number: str,
) -> str:
    """
    Get existing cryptographically random QR token or generate a new one for outlet + basket.
    """
    res = await db.execute(
        select(BasketQrToken).where(
            BasketQrToken.outlet_id == outlet_id,
            BasketQrToken.basket_number == basket_number,
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        return existing.token

    # Generate a cryptographically random token (32 bytes url-safe string)
    token = secrets.token_urlsafe(32)
    qr_token = BasketQrToken(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number=basket_number,
        token=token,
    )
    db.add(qr_token)
    await db.flush()
    return token


async def resolve_qr_token(
    db: AsyncSession,
    token: str,
) -> dict[str, str]:
    """
    Resolve cryptographically random token -> outlet_slug and basket_number.
    """
    res = await db.execute(
        select(BasketQrToken, Outlet)
        .join(Outlet, BasketQrToken.outlet_id == Outlet.id)
        .where(BasketQrToken.token == token)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid or expired QR token.")

    qr_token, outlet = row
    return {
        "outlet_slug": outlet.slug,
        "outlet_name": outlet.name,
        "basket_number": qr_token.basket_number,
    }
