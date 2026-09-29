"""
Datetime utilities for timezone handling and database compatibility.

All timestamp columns in the PostgreSQL schema (and SQLite local mode) use
TIMESTAMP WITHOUT TIME ZONE (naive UTC). Passing timezone-aware datetimes
to asyncpg causes 'TypeError: can't subtract offset-naive and offset-aware datetimes'.

This module provides helpers to ensure all datetimes written to or compared
against database columns are properly converted to naive UTC.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def utc_now() -> datetime:
    """Return current UTC time as a naive datetime (for DB compatibility)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ensure_naive_utc(dt: datetime | None) -> datetime | None:
    """
    Ensure datetime is naive UTC.
    If dt is timezone-aware, converts it to UTC and strips tzinfo.
    If dt is already naive, returns it as-is.
    If dt is None, returns None.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def ensure_aware_utc(dt: datetime | None) -> datetime | None:
    """
    Ensure datetime is timezone-aware UTC (for API responses or ISO string serialization).
    If dt is naive, assumes it is UTC and attaches tzinfo=timezone.utc.
    If dt is already aware, converts to UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def strip_tz(val: Any) -> Any:
    """Recursively strip timezone info from datetimes within query parameters."""
    if isinstance(val, datetime):
        if val.tzinfo is not None:
            return val.astimezone(timezone.utc).replace(tzinfo=None)
        return val
    return val
