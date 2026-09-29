"""
Shift utils — calculate business shift windows in IST (GMT+5:30).
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

# GMT+5:30 IST timezone
IST = timezone(timedelta(hours=5, minutes=30))


def parse_reset_time(reset_time_str: str) -> time:
    """
    Parse resetting time string into datetime.time.
    Supports formats: "04:00", "4", "04:00:00", "4:00".
    Defaults to 00:00:00 if invalid or empty.
    """
    if not reset_time_str or not reset_time_str.strip():
        return time(0, 0, 0)

    clean = reset_time_str.strip().lower()
    parts = clean.split(":")

    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        second = int(parts[2]) if len(parts) > 2 else 0
        return time(hour % 24, minute % 60, second % 60)
    except (ValueError, IndexError):
        return time(0, 0, 0)


def get_current_shift_window_utc(
    reset_time_str: str = "00:00",
    ref_utc_now: datetime | None = None,
) -> tuple[datetime, datetime]:
    """
    Calculate current business day shift start & end range in naive UTC.

    - Target timezone: IST (GMT+5:30)
    - If current IST time >= reset_time:
        shift_start = Today at reset_time IST
        shift_end = Tomorrow at reset_time IST - 1 microsecond
    - If current IST time < reset_time:
        shift_start = Yesterday at reset_time IST
        shift_end = Today at reset_time IST - 1 microsecond

    Returns (start_utc, end_utc) as naive UTC datetimes for database querying.
    """
    if ref_utc_now is None:
        ref_utc_now = datetime.now(timezone.utc)
    elif ref_utc_now.tzinfo is None:
        ref_utc_now = ref_utc_now.replace(tzinfo=timezone.utc)

    # Convert reference UTC time to IST
    ist_now = ref_utc_now.astimezone(IST)

    target_time = parse_reset_time(reset_time_str)

    # Compare current IST time of day with reset_time
    today_reset_ist = datetime.combine(ist_now.date(), target_time, tzinfo=IST)

    if ist_now >= today_reset_ist:
        shift_start_ist = today_reset_ist
        shift_end_ist = today_reset_ist + timedelta(days=1) - timedelta(microseconds=1)
    else:
        shift_start_ist = today_reset_ist - timedelta(days=1)
        shift_end_ist = today_reset_ist - timedelta(microseconds=1)

    # Convert shift start & end back to UTC (and make naive for DB compatibility)
    start_utc = shift_start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = shift_end_ist.astimezone(timezone.utc).replace(tzinfo=None)

    return start_utc, end_utc
