"""
Security utilities — JWT encoding/decoding and password hashing (argon2id).
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()

# ── Password hashing (argon2id — OWASP recommended) ─────────────────────

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a plaintext password with argon2id."""
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against its argon2id hash."""
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


# ── JWT tokens ───────────────────────────────────────────────────────────


def create_access_token(
    user_id: uuid.UUID,
    outlet_id: uuid.UUID | None = None,
    role: str = "STAFF",
    expires_delta: timedelta | None = None,
) -> str:
    """Create a short-lived JWT access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "outlet_id": str(outlet_id) if outlet_id else None,
        "role": role,
        "exp": expire,
        "type": "access",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    user_id: uuid.UUID,
    outlet_id: uuid.UUID | None = None,
    role: str = "STAFF",
    expires_delta: timedelta | None = None,
) -> str:
    """Create a longer-lived refresh token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    payload = {
        "sub": str(user_id),
        "outlet_id": str(outlet_id) if outlet_id else None,
        "role": role,
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT token. Raises JWTError on failure.
    Returns the full payload dict.
    """
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )


def hash_token(token: str) -> str:
    """Hash a token (e.g. refresh token) for DB storage — SHA-256."""
    return hashlib.sha256(token.encode()).hexdigest()


# ── WebSocket tickets ────────────────────────────────────────────────────


def create_ws_ticket(
    user_id: uuid.UUID,
    role: str | uuid.UUID = "staff",
    outlet_id: uuid.UUID | None = None,
    ttl_seconds: int = 60,
) -> str:
    """
    Create a short-lived, single-use ticket for WebSocket auth.
    JWTs must NEVER be passed as WS query params — use this instead.
    """
    if isinstance(role, uuid.UUID) and outlet_id is None:
        actual_outlet_id = role
        actual_role = "staff"
    else:
        actual_outlet_id = outlet_id
        actual_role = role.value if hasattr(role, "value") else str(role)

    expire = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    payload = {
        "sub": str(user_id),
        "role": actual_role,
        "outlet_id": str(actual_outlet_id) if actual_outlet_id else None,
        "exp": expire,
        "type": "ws_ticket",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
