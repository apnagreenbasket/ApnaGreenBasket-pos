"""
Evening Price Scheduler — background task that auto-activates / deactivates
evening_price_active on outlets based on their configured time window.

Runs every 60 seconds, compares current IST time against each outlet's
evening_auto_start_time / evening_auto_end_time.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time, timezone, timedelta

from sqlalchemy import select, update

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))


def _parse_hhmm(value: str) -> time | None:
    """Parse 'HH:MM' string into a time object, or None if invalid."""
    try:
        parts = value.strip().split(":")
        return time(int(parts[0]), int(parts[1]))
    except (ValueError, IndexError):
        return None


def _is_in_window(now_time: time, start: time, end: time) -> bool:
    """Check if now_time falls within [start, end).
    Handles overnight windows (e.g., 22:00 → 06:00).
    """
    if start <= end:
        # Normal window: e.g., 16:00 → 22:00
        return start <= now_time < end
    else:
        # Overnight window: e.g., 22:00 → 06:00
        return now_time >= start or now_time < end


async def _tick(db_session_factory) -> None:
    """Single scheduler tick — check all auto-enabled outlets and update state."""
    from app.models.outlet import Outlet

    now_ist = datetime.now(IST).time()

    async with db_session_factory() as db:
        from sqlalchemy import or_
        result = await db.execute(
            select(
                Outlet.id,
                Outlet.slug,
                Outlet.evening_price_active,
                Outlet.evening_auto_start_time,
                Outlet.evening_auto_end_time,
            ).where(
                or_(
                    Outlet.evening_pricing_mode == "AUTO",
                    Outlet.evening_auto_enabled == True,  # noqa: E712
                ),
                Outlet.evening_auto_start_time.isnot(None),
                Outlet.evening_auto_end_time.isnot(None),
            )
        )
        rows = result.all()

        from app.services.cache_service import invalidate_menu_cache

        for outlet_id, outlet_slug, current_active, start_str, end_str in rows:
            start_t = _parse_hhmm(start_str)
            end_t = _parse_hhmm(end_str)
            if start_t is None or end_t is None:
                continue

            should_be_active = _is_in_window(now_ist, start_t, end_t)

            if should_be_active != current_active:
                await db.execute(
                    update(Outlet)
                    .where(Outlet.id == outlet_id)
                    .values(evening_price_active=should_be_active)
                )
                await invalidate_menu_cache(outlet_slug)
                action = "ACTIVATED" if should_be_active else "DEACTIVATED"
                logger.info(
                    "Evening price %s for outlet %s (window %s–%s, now %s IST)",
                    action, outlet_id, start_str, end_str,
                    now_ist.strftime("%H:%M"),
                )

        await db.commit()


async def run_evening_scheduler(db_session_factory, interval_seconds: int = 60) -> None:
    """Long-running background loop. Call as an asyncio task from app lifespan."""
    logger.info("Evening price scheduler started (interval=%ds)", interval_seconds)
    while True:
        try:
            await _tick(db_session_factory)
        except asyncio.CancelledError:
            logger.info("Evening price scheduler stopped")
            raise
        except Exception:
            logger.exception("Evening scheduler tick failed")
        await asyncio.sleep(interval_seconds)
