"""
Cache service — Redis cache-aside with jittered TTL and thundering-herd lock.
"""

from __future__ import annotations

import asyncio
import json
import random
from typing import Any

from app.core.redis import get_redis

# Base TTL: 24 hours, jitter: ±10%
_BASE_TTL = 86400  # seconds
_JITTER_FRACTION = 0.10
_LOCK_TTL = 5  # seconds
_LOCK_WAIT = 0.2  # seconds between retries
_MAX_RETRIES = 25  # 25 * 0.2s = 5s max wait


def _jittered_ttl() -> int:
    """24h ± 10% random jitter to avoid synchronized mass expiry."""
    jitter = int(_BASE_TTL * _JITTER_FRACTION)
    return _BASE_TTL + random.randint(-jitter, jitter)


async def get_cached_menu(slug: str) -> dict | None:
    """
    Check Redis for cached menu JSON.
    Returns parsed dict or None on cache miss.
    """
    r = await get_redis()
    cached = await r.get(f"menu:{slug}")
    if cached:
        return json.loads(cached)
    return None


async def set_cached_menu(slug: str, data: dict) -> None:
    """Store menu JSON in Redis with jittered TTL."""
    r = await get_redis()
    await r.set(f"menu:{slug}", json.dumps(data, default=str), ex=_jittered_ttl())


async def invalidate_menu_cache(slug: str) -> None:
    """
    Delete the cached menu for a restaurant.
    MUST be called synchronously within any request that creates/updates/deletes
    a Category, MenuItem, or MenuItemVariant.
    """
    r = await get_redis()
    await r.delete(f"menu:{slug}")


async def invalidate_menu_cache_by_outlet_id(db: Any, outlet_id: Any) -> None:
    """
    Helper to invalidate the cache when only the outlet_id is known.
    """
    from sqlalchemy import select
    from app.models.outlet import Outlet
    res = await db.execute(select(Outlet.slug).where(Outlet.id == outlet_id))
    slug = res.scalar_one_or_none()
    if slug:
        await invalidate_menu_cache(slug)


async def acquire_menu_lock(slug: str) -> bool:
    """
    Acquire a short Redis lock for thundering-herd protection.
    Returns True if lock was acquired, False if held by another request.
    """
    r = await get_redis()
    return bool(await r.set(f"menu_lock:{slug}", "1", nx=True, ex=_LOCK_TTL))


async def release_menu_lock(slug: str) -> None:
    """Release the menu lock after DB query + cache write."""
    r = await get_redis()
    await r.delete(f"menu_lock:{slug}")


async def wait_for_cache(slug: str) -> dict | None:
    """
    Called when another request holds the lock.
    Wait briefly and retry the cache until it's populated or retries are exhausted.
    """
    for _ in range(_MAX_RETRIES):
        await asyncio.sleep(_LOCK_WAIT)
        cached = await get_cached_menu(slug)
        if cached:
            return cached
    return None
