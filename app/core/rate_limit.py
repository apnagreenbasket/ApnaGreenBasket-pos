"""
Rate limiting — Redis-backed via slowapi.
Applied to public menu, webhook, and "I have paid" endpoints.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

# Uses client IP as the rate-limit key
limiter = Limiter(key_func=get_remote_address)
