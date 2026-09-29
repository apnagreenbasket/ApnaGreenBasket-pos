"""
Password reset & account lockout service.
Handles:
- Resend OTP delivery
- 1-minute cooling period (cooldown)
- 5 OTP requests per 15-minute window limit
- 5 wrong OTP attempts = OTP invalidation (anti-guessing)
- 5 wrong password attempts = 15-minute account lockout
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import uuid
from typing import Tuple

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.redis import get_redis
from app.core.security import hash_password
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

OTP_EXPIRY_SECONDS = 900         # 15 minutes
COOLDOWN_SECONDS = 60            # 1 minute between resends
MAX_REQUESTS_IN_WINDOW = 5       # Max 5 OTP requests in 15 mins
MAX_WRONG_OTP_ATTEMPTS = 5       # Max 5 invalid OTP attempts before invalidation
MAX_FAILED_LOGIN_ATTEMPTS = 5    # Max 5 failed password attempts before lockout
LOCKOUT_DURATION_SECONDS = 900   # 15 minutes account lockout


def _hash_otp(otp: str) -> str:
    """Create a secure SHA-256 digest of the 6-digit OTP."""
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def mask_email(email: str) -> str:
    """Mask email for display, e.g. 'rahul@example.com' -> 'r***l@example.com'."""
    try:
        parts = email.split("@")
        username = parts[0]
        domain = parts[1]
        if len(username) <= 2:
            masked_user = username[0] + "*"
        else:
            masked_user = username[0] + "*" * (len(username) - 2) + username[-1]
        return f"{masked_user}@{domain}"
    except Exception:
        return email


# ============================================================
# 1. Resend Email Sending
# ============================================================

async def send_otp_email(to_email: str, otp: str) -> None:
    """
    Send OTP email using Resend API.
    Falls back gracefully to logging if RESEND_API_KEY is not configured.
    """
    api_key = settings.RESEND_API_KEY.strip()
    from_email = settings.RESEND_FROM_EMAIL.strip() or "ApnaGreen Basket <noreply@apnagreenbasket.com>"

    # Build branded HTML email with 100% inline styles and table layout for universal email client compatibility
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Verification Code</title>
      <style>
        body {{ margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }}
      </style>
    </head>
    <body style="margin: 0; padding: 24px 10px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f8fafc;">
        <tr>
          <td align="center" style="padding: 10px 0;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); overflow: hidden;">
              <tr>
                <td style="padding: 32px 28px;">
                  <!-- Header -->
                  <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #15803d; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">ApnaGreen Basket</h1>
                    <h2 style="color: #0f172a; font-size: 18px; font-weight: 600; margin-top: 8px; margin-bottom: 0;">Password Reset Verification Code</h2>
                  </div>

                  <!-- Greeting & Info -->
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 12px 0;">Hello,</p>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                    We received a request to reset the password for your account (<strong style="color: #0f172a;">{to_email}</strong>). Use the 6-digit verification code below to set a new password:
                  </p>

                  <!-- OTP Code Box -->
                  <div style="background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 12px; padding: 22px 16px; text-align: center; margin: 24px 0;">
                    <span style="font-family: 'SF Mono', Consolas, Menlo, Monaco, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #166534; display: inline-block;">{otp}</span>
                  </div>

                  <!-- Security Warning -->
                  <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #92400e; margin: 24px 0; line-height: 1.5;">
                    <strong style="display: block; margin-bottom: 6px;">Security Notice:</strong>
                    <ul style="margin: 0; padding-left: 18px;">
                      <li style="margin-bottom: 4px;">This code expires in <strong>15 minutes</strong>.</li>
                      <li style="margin-bottom: 4px;">If entered incorrectly 5 times, it will be automatically invalidated.</li>
                      <li>Never share this code with anyone. Our team will never ask for it.</li>
                    </ul>
                  </div>

                  <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 24px 0;">
                    If you did not request this password reset, you can safely ignore this email — your account remains secure.
                  </p>

                  <!-- Footer -->
                  <div style="text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                    &copy; ApnaGreen Basket POS &bull; Secure Authentication System
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    text_content = f"""ApnaGreen Basket - Password Reset Verification Code

Hello,

We received a request to reset the password for your account ({to_email}).
Your 6-digit verification code is:

{otp}

Security Notice:
- This code expires in 15 minutes.
- If entered incorrectly 5 times, it will be automatically invalidated.
- Never share this code with anyone. Our team will never ask for it.

If you did not request this password reset, you can safely ignore this email.

© ApnaGreen Basket POS • Secure Authentication System
"""

    if not api_key:
        logger.warning(
            f"[MOCK EMAIL / NO RESEND_API_KEY] Password reset OTP for {to_email} is: {otp}"
        )
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_email,
                    "to": [to_email],
                    "subject": "Your ApnaGreen Basket Password Reset Code",
                    "html": html_content,
                    "text": text_content,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"Resend API error: status {resp.status_code}, response: {resp.text}")
                # Don't crash for the user if email gateway fails temporarily, log it
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to send verification email. Please try again in a few moments.",
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error connecting to Resend API: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Error sending reset code. Please try again later.",
        )


# ============================================================
# 2. Account Lockout on Failed Passwords
# ============================================================

async def check_account_locked(email: str) -> Tuple[bool, int]:
    """
    Check if the account is currently locked due to 5 failed password attempts.
    Returns: (is_locked: bool, remaining_seconds: int)
    """
    redis = await get_redis()
    clean_email = email.strip().lower()
    lock_key = f"login:locked:{clean_email}"
    
    val = await redis.get(lock_key)
    if val:
        # Check TTL if available
        ttl = 900
        if hasattr(redis, "ttl"):
            try:
                ttl_val = await redis.ttl(lock_key)
                if ttl_val > 0:
                    ttl = ttl_val
            except Exception:
                pass
        return True, ttl
    return False, 0


async def send_account_unlock_email(to_email: str, unlock_token: str) -> None:
    """
    Send an instant account unlock link via Resend API.
    """
    current_settings = get_settings()
    api_key = current_settings.RESEND_API_KEY
    from_email = current_settings.RESEND_FROM_EMAIL
    unlock_url = f"{current_settings.frontend_base_url}/unlock-account?token={unlock_token}"

    # Build branded HTML email with 100% inline styles and table layout
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Temporarily Locked - Instant Unlock</title>
      <style>
        body {{ margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }}
      </style>
    </head>
    <body style="margin: 0; padding: 24px 10px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f8fafc;">
        <tr>
          <td align="center" style="padding: 10px 0;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); overflow: hidden;">
              <tr>
                <td style="padding: 32px 28px;">
                  <!-- Header -->
                  <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #15803d; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">ApnaGreen Basket</h1>
                    <h2 style="color: #0f172a; font-size: 18px; font-weight: 600; margin-top: 8px; margin-bottom: 0;">Security Alert: Account Locked</h2>
                  </div>

                  <!-- Greeting & Info -->
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 12px 0;">Hello,</p>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                    Your account (<strong style="color: #0f172a;">{to_email}</strong>) was temporarily locked because <strong style="color: #dc2626;">5 consecutive failed login attempts</strong> were detected.
                  </p>

                  <!-- Alert Box -->
                  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 14px 16px; margin: 20px 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
                    <strong style="display: block; margin-bottom: 4px;">Why did this happen?</strong>
                    Someone entered an incorrect password or PIN 5 times. To safeguard your account and store data from brute-force attacks, further login attempts are blocked for 15 minutes.
                  </div>

                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 20px 0 12px 0;">
                    <strong>If this was someone else trying to lock you out:</strong><br/>
                    You do NOT have to wait 15 minutes. Click the button below to <strong style="color: #15803d;">immediately unlock your account</strong>:
                  </p>

                  <!-- CTA Button -->
                  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px 0;">
                    <tr>
                      <td align="center">
                        <a href="{unlock_url}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff !important; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.3);">
                          Unlock My Account Immediately &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">Or copy and paste this link into your browser:</p>
                  <div style="word-break: break-all; font-size: 11px; color: #475569; background-color: #f1f5f9; padding: 10px 12px; border-radius: 6px; font-family: monospace; border: 1px solid #e2e8f0;">
                    {unlock_url}
                  </div>

                  <p style="color: #94a3b8; font-size: 12px; margin: 20px 0 0 0; line-height: 1.4;">
                    <em>Note: This unlock link is single-use and expires in 15 minutes. Once clicked, all login restrictions on your account will be cleared.</em>
                  </p>

                  <!-- Footer -->
                  <div style="text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 28px;">
                    &copy; ApnaGreen Basket POS &bull; Enterprise Security Protection
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    text_content = f"""ApnaGreen Basket - Account Temporarily Locked

Hello,

Your account ({to_email}) was temporarily locked because 5 consecutive failed login attempts were detected.

To safeguard your account and store data from brute-force attacks, login attempts are blocked for 15 minutes.

If this was someone else trying to lock you out, you can unlock your account immediately by opening this link:
{unlock_url}

This link is single-use and will expire in 15 minutes.

© ApnaGreen Basket POS • Enterprise Security Protection
"""

    if not api_key:
        logger.warning(
            f"[MOCK EMAIL / NO RESEND_API_KEY] Account unlock link for {to_email} is: {unlock_url}"
        )
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_email,
                    "to": [to_email],
                    "subject": "Security Alert: ApnaGreen Basket Account Locked — Instant Unlock Link",
                    "html": html_content,
                    "text": text_content,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"Resend API error sending unlock email: status {resp.status_code}, response: {resp.text}")
    except Exception as e:
        logger.error(f"Error sending account unlock email via Resend: {e}")


async def record_failed_login(email: str) -> Tuple[bool, int, int]:
    """
    Record a failed password attempt for this email.
    If attempts reach MAX_FAILED_LOGIN_ATTEMPTS (5):
      - Locks the account for LOCKOUT_DURATION_SECONDS (15 minutes).
      - Clears the failed attempts counter.
      - Dispatches an instant unlock link via email.
    Returns: (is_locked: bool, remaining_attempts: int, lockout_seconds: int)
    """
    redis = await get_redis()
    clean_email = email.strip().lower()
    fail_key = f"login:failed:{clean_email}"
    lock_key = f"login:locked:{clean_email}"

    # Increment counter
    current = await redis.get(fail_key)
    attempts = int(current) + 1 if current else 1
    
    # Set with 15 min sliding expiration
    await redis.set(fail_key, str(attempts), ex=LOCKOUT_DURATION_SECONDS)

    if attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
        # Lock account for 15 minutes
        await redis.set(lock_key, "1", ex=LOCKOUT_DURATION_SECONDS)
        await redis.delete(fail_key)

        # Generate and dispatch instant unlock email
        try:
            unlock_token = secrets.token_urlsafe(32)
            unlock_key = f"login:unlock_token:{unlock_token}"
            user_unlock_key = f"login:user_unlock_token:{clean_email}"
            await redis.set(unlock_key, clean_email, ex=LOCKOUT_DURATION_SECONDS)
            await redis.set(user_unlock_key, unlock_token, ex=LOCKOUT_DURATION_SECONDS)
            await send_account_unlock_email(clean_email, unlock_token)
        except Exception as e:
            logger.error(f"Failed to dispatch unlock email on account lockout: {e}")

        return True, 0, LOCKOUT_DURATION_SECONDS

    remaining = MAX_FAILED_LOGIN_ATTEMPTS - attempts
    return False, remaining, 0


async def clear_failed_logins(email: str) -> None:
    """Clear failed login attempts and unlock the account."""
    redis = await get_redis()
    clean_email = email.strip().lower()
    user_unlock_key = f"login:user_unlock_token:{clean_email}"
    token = await redis.get(user_unlock_key)
    keys_to_del = [f"login:failed:{clean_email}", f"login:locked:{clean_email}", user_unlock_key]
    if token:
        keys_to_del.append(f"login:unlock_token:{token}")
    await redis.delete(*keys_to_del)


async def unlock_account_by_token(token: str, db: AsyncSession | None = None) -> dict:
    """
    Validate one-time unlock token and immediately clear:
    1. Account lockout (login:locked:{email})
    2. Failed login counter (login:failed:{email})
    3. Token itself (login:unlock_token:{token})
    4. Forgot password request limit window (pwd_reset:window:{email})
    5. Forgot password cooling period (pwd_reset:cooldown:{email})
    6. Active reset OTP (pwd_reset:otp:{email})
    7. Record audit log entry in database if db session provided.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unlock token is required.",
        )

    clean_token = token.strip()
    redis = await get_redis()
    unlock_key = f"login:unlock_token:{clean_token}"

    email = await redis.get(unlock_key)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This unlock link is invalid or has already expired. If your account is still locked, you can wait for the 15-minute lockout or request a new unlock link.",
        )

    clean_email = email.strip().lower()

    # Clear all locks and rate limits for this email
    user_unlock_key = f"login:user_unlock_token:{clean_email}"
    await redis.delete(
        unlock_key,
        user_unlock_key,
        f"login:locked:{clean_email}",
        f"login:failed:{clean_email}",
        f"pwd_reset:window:{clean_email}",
        f"pwd_reset:cooldown:{clean_email}",
        f"pwd_reset:otp:{clean_email}",
        f"login:unlock_cooldown:{clean_email}",
    )

    # Record audit log if DB session is available
    if db:
        try:
            res = await db.execute(select(User).where(func.lower(User.email) == clean_email))
            unlocked_user = res.scalar_one_or_none()
            if unlocked_user:
                if unlocked_user.outlet_id:
                    from app.models.staff_audit_log import StaffAuditLog
                    db.add(StaffAuditLog(
                        id=uuid.uuid4(),
                        staff_id=unlocked_user.id,
                        outlet_id=unlocked_user.outlet_id,
                        action_type="account_unlocked",
                        reference_type="User",
                        reference_id=str(unlocked_user.id),
                        details="Unlocked via email security link",
                    ))
                from app.models.audit_log import AuditLog
                db.add(AuditLog(
                    id=uuid.uuid4(),
                    outlet_id=unlocked_user.outlet_id,
                    user_id=unlocked_user.id,
                    action="ACCOUNT_UNLOCKED",
                    entity_type="User",
                    entity_id=str(unlocked_user.id),
                    details={"email": unlocked_user.email, "name": unlocked_user.name},
                    description="Unlocked via email security link",
                ))
                await db.flush()
        except Exception as e:
            logger.error(f"Error writing audit log for unlock_account_by_token: {e}")

    logger.info(f"Account for {clean_email} successfully unlocked via security email token.")

    return {
        "message": "Your account has been unlocked successfully. All login and reset restrictions have been cleared. You can now log in.",
        "email_masked": mask_email(clean_email),
    }


async def resend_account_unlock_email(email: str) -> dict:
    """
    Resend an instant unlock link for a locked account.
    Enforces a 60-second cooldown to prevent abuse.
    """
    clean_email = email.strip().lower()
    redis = await get_redis()

    is_locked, _ = await check_account_locked(clean_email)
    if not is_locked:
        return {
            "message": "If this account is currently locked, an unlock link has been sent to the registered email.",
        }

    # Cooldown check (60s)
    cooldown_key = f"login:unlock_cooldown:{clean_email}"
    in_cooldown = await redis.get(cooldown_key)
    if in_cooldown:
        ttl = 60
        if hasattr(redis, "ttl"):
            try:
                t = await redis.ttl(cooldown_key)
                if t > 0:
                    ttl = t
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {ttl} seconds before requesting another unlock email.",
        )

    # Generate new token
    unlock_token = secrets.token_urlsafe(32)
    unlock_key = f"login:unlock_token:{unlock_token}"
    user_unlock_key = f"login:user_unlock_token:{clean_email}"

    # Delete old token if exists
    old_token = await redis.get(user_unlock_key)
    if old_token:
        await redis.delete(f"login:unlock_token:{old_token}")

    await redis.set(unlock_key, clean_email, ex=LOCKOUT_DURATION_SECONDS)
    await redis.set(user_unlock_key, unlock_token, ex=LOCKOUT_DURATION_SECONDS)
    await redis.set(cooldown_key, "1", ex=COOLDOWN_SECONDS)

    await send_account_unlock_email(clean_email, unlock_token)

    return {
        "message": "An instant unlock link has been sent to your registered email address.",
        "cooldown_seconds": COOLDOWN_SECONDS,
        "email_masked": mask_email(clean_email),
    }


# ============================================================
# 3. Forgot Password OTP Flow
# ============================================================

async def request_password_reset_otp(
    db: AsyncSession,
    email: str,
) -> dict:
    """
    Request a 6-digit OTP code for password reset.
    Enforces:
    1. 1-minute cooling period (cooldown)
    2. Max 5 OTP requests per 15-minute rolling window
    3. User must exist and be active
    """
    clean_email = email.strip().lower()
    redis = await get_redis()

    # 1. Verify user exists in database
    result = await db.execute(select(User).where(func.lower(User.email) == clean_email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account does not exist.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has been deactivated. Please contact your administrator.",
        )

    # 2. Check 1-minute cooling period
    cooldown_key = f"pwd_reset:cooldown:{clean_email}"
    in_cooldown = await redis.get(cooldown_key)
    if in_cooldown:
        ttl = COOLDOWN_SECONDS
        if hasattr(redis, "ttl"):
            try:
                t = await redis.ttl(cooldown_key)
                if t > 0:
                    ttl = t
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {ttl} seconds before requesting another verification code.",
        )

    # 3. Check 15-minute window request limit (max 5)
    window_key = f"pwd_reset:window:{clean_email}"
    window_count_str = await redis.get(window_key)
    window_count = int(window_count_str) if window_count_str else 0

    if window_count >= MAX_REQUESTS_IN_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You have reached the limit of 5 verification code requests in 15 minutes. Please try again later.",
        )

    # 4. Generate 6-digit cryptographically secure OTP
    otp = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = _hash_otp(otp)

    # 5. Store OTP state in Redis (expires in 15 minutes)
    otp_key = f"pwd_reset:otp:{clean_email}"
    otp_payload = json.dumps({
        "otp_hash": otp_hash,
        "wrong_attempts": 0,
    })
    await redis.set(otp_key, otp_payload, ex=OTP_EXPIRY_SECONDS)

    # 6. Set 60-second cooldown
    await redis.set(cooldown_key, "1", ex=COOLDOWN_SECONDS)

    # 7. Increment 15-minute request count
    if window_count == 0:
        await redis.set(window_key, "1", ex=OTP_EXPIRY_SECONDS)
    else:
        await redis.set(window_key, str(window_count + 1), ex=OTP_EXPIRY_SECONDS)

    # 8. Send OTP email via Resend
    await send_otp_email(clean_email, otp)

    return {
        "message": "A 6-digit verification code has been sent to your email address.",
        "cooldown_seconds": COOLDOWN_SECONDS,
        "email_masked": mask_email(clean_email),
    }


async def verify_and_reset_password(
    db: AsyncSession,
    email: str,
    otp: str,
    new_password: str,
) -> dict:
    """
    Verify the 6-digit OTP and reset password.
    Enforces:
    1. Wrong OTP count tracking.
    2. If wrong OTP entered 5 times -> immediately invalidate/expire the OTP.
    3. On success -> updates password, revokes refresh tokens, and immediately unlocks the account!
    """
    clean_email = email.strip().lower()
    redis = await get_redis()
    otp_key = f"pwd_reset:otp:{clean_email}"

    raw_data = await redis.get(otp_key)
    if not raw_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired or was not requested. Please request a new code.",
        )

    try:
        data = json.loads(raw_data)
        stored_hash = data["otp_hash"]
        wrong_attempts = data.get("wrong_attempts", 0)
    except Exception:
        await redis.delete(otp_key)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid code session. Please request a new code.",
        )

    # Validate OTP
    incoming_hash = _hash_otp(otp.strip())
    if incoming_hash != stored_hash:
        wrong_attempts += 1
        if wrong_attempts >= MAX_WRONG_OTP_ATTEMPTS:
            # Invalidate immediately!
            await redis.delete(otp_key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many incorrect attempts (5/5). Your verification code has expired for security. Please request a new code.",
            )
        
        # Save updated wrong attempts maintaining TTL
        ttl = OTP_EXPIRY_SECONDS
        if hasattr(redis, "ttl"):
            try:
                t = await redis.ttl(otp_key)
                if t > 0:
                    ttl = t
            except Exception:
                pass
        
        data["wrong_attempts"] = wrong_attempts
        await redis.set(otp_key, json.dumps(data), ex=ttl)

        remaining = MAX_WRONG_OTP_ATTEMPTS - wrong_attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect verification code. {remaining} attempt{'s' if remaining != 1 else ''} remaining before code expires.",
        )

    # OTP is correct! Fetch user and update password
    result = await db.execute(select(User).where(func.lower(User.email) == clean_email))
    user = result.scalar_one_or_none()
    if not user:
        await redis.delete(otp_key)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    # Update password and invalidate active session tokens
    user.password_hash = hash_password(new_password)
    user.refresh_token_hash = None

    # Audit log for password change
    try:
        if user.outlet_id:
            from app.models.staff_audit_log import StaffAuditLog
            staff_log = StaffAuditLog(
                id=uuid.uuid4(),
                staff_id=user.id,
                outlet_id=user.outlet_id,
                action_type="staff_password_reset",
                reference_type="User",
                reference_id=str(user.id),
                details="Reset password via OTP verification",
            )
            db.add(staff_log)

        from app.models.audit_log import AuditLog
        system_log = AuditLog(
            id=uuid.uuid4(),
            outlet_id=user.outlet_id,
            user_id=user.id,
            action="PASSWORD_RESET_COMPLETED",
            entity_type="User",
            entity_id=str(user.id),
            details={"email": user.email, "name": user.name},
            description="Reset password via OTP verification",
        )
        db.add(system_log)
    except Exception as e:
        logger.error(f"Error creating audit log for password reset: {e}")

    await db.flush()

    # Clean up Redis: delete OTP and unlock account immediately
    await redis.delete(otp_key)
    await clear_failed_logins(clean_email)

    return {
        "message": "Password has been successfully reset. You can now sign in with your new password.",
        "email": clean_email,
    }
