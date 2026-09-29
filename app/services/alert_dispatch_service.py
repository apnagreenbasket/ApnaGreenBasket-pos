"""
Alert Dispatch Service — Multi-channel notification dispatcher using Resend (Email),
Twilio / Meta (WhatsApp), and Twilio / Gateway (SMS text messages).
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _normalize_phone_number(phone: str, default_country_code: str = "+91") -> str:
    """Ensure phone number has standard E.164 international format."""
    clean = re.sub(r"[^\d+]", "", phone.strip())
    if not clean:
        return ""
    if clean.startswith("+"):
        return clean
    if len(clean) == 10:
        return f"{default_country_code}{clean}"
    if clean.startswith("91") and len(clean) == 12:
        return f"+{clean}"
    return f"+{clean}"


def build_alert_email_html(
    title: str,
    message: str,
    outlet_name: str,
    details: dict[str, Any] | None = None,
) -> str:
    """Build a modern, responsive HTML email template for store alerts."""
    details = details or {}
    item_name = details.get("item_name", "Inventory Item")
    batch_num = details.get("batch_number", "N/A")
    remaining_qty = details.get("remaining_quantity", "")
    unit = details.get("unit", "units")
    cost_per_unit = details.get("cost_per_unit")
    mrp = details.get("mrp")
    expiry_date = details.get("expiry_date", "")
    shelf_hrs = details.get("shelf_life_alert_hrs", "")

    rows_html = f"""
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 13px;">Item Name</td>
            <td style="padding: 10px 0; color: #f4f4f5; font-weight: 600; font-size: 14px; text-align: right;">{item_name}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 13px;">Batch Lot #</td>
            <td style="padding: 10px 0; color: #f59e0b; font-family: monospace; font-weight: 700; font-size: 13px; text-align: right;">{batch_num}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 13px;">Remaining Stock</td>
            <td style="padding: 10px 0; color: #10b981; font-weight: 700; font-size: 14px; text-align: right;">{remaining_qty} {unit}</td>
        </tr>
    """

    if cost_per_unit is not None or mrp is not None:
        cost_str = f"₹{float(cost_per_unit):.2f}" if cost_per_unit is not None else "N/A"
        mrp_str = f"₹{float(mrp):.2f}" if mrp is not None else "N/A"
        rows_html += f"""
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 13px;">Cost / MRP</td>
            <td style="padding: 10px 0; color: #f4f4f5; font-size: 13px; text-align: right;">{cost_str} / {mrp_str}</td>
        </tr>
        """

    if expiry_date:
        rows_html += f"""
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 13px;">Expiry Date</td>
            <td style="padding: 10px 0; color: #ef4444; font-weight: 600; font-size: 13px; text-align: right;">{str(expiry_date)[:10]}</td>
        </tr>
        """

    if shelf_hrs:
        try:
            hrs_val = float(shelf_hrs)
            if hrs_val >= 24 and hrs_val % 24 == 0:
                shelf_display = f"{int(hrs_val // 24)} days ({int(hrs_val)} hrs)"
            elif hrs_val >= 24:
                shelf_display = f"{hrs_val / 24:.1f} days ({int(hrs_val)} hrs)"
            else:
                shelf_display = f"{int(hrs_val)} hours"
        except Exception:
            shelf_display = f"{shelf_hrs} hours"
        rows_html += f"""
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 13px;">Shelf Life Threshold</td>
            <td style="padding: 10px 0; color: #38bdf8; font-weight: 600; font-size: 13px; text-align: right;">{shelf_display}</td>
        </tr>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>{title}</title>
    </head>
    <body style="margin:0; padding:24px; background-color:#09090b; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f4f4f5;">
        <div style="max-width:560px; margin:0 auto; background-color:#18181b; border:1px solid #27272a; border-radius:16px; overflow:hidden; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.5);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding:24px; text-align:center;">
                <h1 style="margin:0; font-size:20px; font-weight:800; color:#ffffff; letter-spacing:0.5px;">ApnaGreen Basket</h1>
                <p style="margin:4px 0 0 0; font-size:12px; color:#d1fae5; text-transform:uppercase; font-weight:600; letter-spacing:1px;">Store Alert · {outlet_name}</p>
            </div>
            
            <!-- Body Content -->
            <div style="padding:28px 24px;">
                <div style="display:inline-block; background-color:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.3); color:#fbbf24; font-size:12px; font-weight:700; padding:4px 10px; border-radius:6px; margin-bottom:16px;">
                    ⚠️ {title}
                </div>
                
                <p style="margin:0 0 20px 0; font-size:14px; line-height:1.6; color:#d4d4d8;">
                    {message}
                </p>

                <!-- Details Table -->
                <div style="background-color:#27272a; border-radius:12px; padding:16px; margin-bottom:24px;">
                    <h3 style="margin:0 0 12px 0; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#a1a1aa;">Batch &amp; Stock Information</h3>
                    <table style="width:100%; border-collapse:collapse;">
                        {rows_html}
                    </table>
                </div>

                <p style="margin:0; font-size:12px; color:#71717a; text-align:center; line-height:1.5;">
                    This is an automated operational notification sent from your ApnaGreen Basket Cloud POS.
                </p>
            </div>
        </div>
    </body>
    </html>
    """


async def send_resend_email(
    to_emails: list[str],
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    """
    Send an email to one or multiple recipients using Resend REST API.
    Gracefully logs if RESEND_API_KEY is not configured.
    """
    if not to_emails:
        return False

    valid_emails = [e.strip() for e in to_emails if e and "@" in e]
    if not valid_emails:
        return False

    api_key = settings.RESEND_API_KEY.strip() if settings.RESEND_API_KEY else ""
    from_email = settings.RESEND_FROM_EMAIL.strip() if settings.RESEND_FROM_EMAIL else "ApnaGreen Basket <alerts@apnagreenbasket.com>"

    if not api_key:
        logger.info(
            "📧 [Resend Mock Email] RESEND_API_KEY is empty. Would send to %s: '%s'",
            valid_emails,
            subject,
        )
        print(f"📧 [Resend Mock Email] Sent to {valid_emails}: {subject}")
        return True

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": from_email,
        "to": valid_emails,
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201):
                logger.info("📧 [Resend] Successfully dispatched email to %s: %s", valid_emails, resp.json())
                return True
            else:
                logger.error("📧 [Resend Error] Status %d: %s", resp.status_code, resp.text)
                return False
    except Exception as e:
        logger.error("📧 [Resend Exception] Failed to send email to %s: %s", valid_emails, e)
        return False


async def send_whatsapp_alert(
    to_phones: list[str],
    message: str,
) -> bool:
    """
    Dispatch WhatsApp alert to phone numbers using Twilio WhatsApp or Meta Cloud API.
    Gracefully logs if credentials are not configured.
    """
    if not to_phones:
        return False

    norm_phones = [_normalize_phone_number(p) for p in to_phones if p.strip()]
    norm_phones = [p for p in norm_phones if p]
    if not norm_phones:
        return False

    # 1. Twilio WhatsApp
    account_sid = settings.TWILIO_ACCOUNT_SID.strip() if settings.TWILIO_ACCOUNT_SID else ""
    auth_token = settings.TWILIO_AUTH_TOKEN.strip() if settings.TWILIO_AUTH_TOKEN else ""
    from_wa = settings.TWILIO_WHATSAPP_FROM.strip() if settings.TWILIO_WHATSAPP_FROM else ""

    if account_sid and auth_token and from_wa:
        if not from_wa.startswith("whatsapp:"):
            from_wa = f"whatsapp:{from_wa}"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        all_success = True

        async with httpx.AsyncClient(timeout=10.0) as client:
            for phone in norm_phones:
                to_wa = f"whatsapp:{phone}"
                data = {
                    "From": from_wa,
                    "To": to_wa,
                    "Body": message,
                }
                try:
                    resp = await client.post(url, data=data, auth=(account_sid, auth_token))
                    if resp.status_code in (200, 201):
                        logger.info("💬 [Twilio WhatsApp] Sent to %s", phone)
                    else:
                        logger.error("💬 [Twilio WhatsApp Error] Status %d: %s", resp.status_code, resp.text)
                        all_success = False
                except Exception as e:
                    logger.error("💬 [Twilio WhatsApp Exception] %s: %s", phone, e)
                    all_success = False
        return all_success

    # 2. Meta WhatsApp Cloud API (Alternative)
    meta_token = settings.META_WHATSAPP_TOKEN.strip() if settings.META_WHATSAPP_TOKEN else ""
    meta_phone_id = settings.META_WHATSAPP_PHONE_ID.strip() if settings.META_WHATSAPP_PHONE_ID else ""

    if meta_token and meta_phone_id:
        url = f"https://graph.facebook.com/v20.0/{meta_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {meta_token}",
            "Content-Type": "application/json",
        }
        all_success = True

        async with httpx.AsyncClient(timeout=10.0) as client:
            for phone in norm_phones:
                recipient_number = phone.lstrip("+")
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": recipient_number,
                    "type": "text",
                    "text": {"preview_url": False, "body": message},
                }
                try:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        logger.info("💬 [Meta WhatsApp] Sent to %s", phone)
                    else:
                        logger.error("💬 [Meta WhatsApp Error] Status %d: %s", resp.status_code, resp.text)
                        all_success = False
                except Exception as e:
                    logger.error("💬 [Meta WhatsApp Exception] %s: %s", phone, e)
                    all_success = False
        return all_success

    # Fallback mock logging when credentials are not configured
    logger.info("💬 [WhatsApp Mock] Credentials not configured. Would send to %s: %s", norm_phones, message)
    print(f"💬 [WhatsApp Mock] Sent to {norm_phones}: {message}")
    return True


async def send_sms_alert(
    to_phones: list[str],
    message: str,
) -> bool:
    """
    Dispatch SMS text message to phone numbers using Fast2SMS, MSG91, or Twilio SMS.
    Auto-detects whichever provider credentials are configured.
    Gracefully logs if credentials are not configured.
    """
    if not to_phones:
        return False

    norm_phones = [_normalize_phone_number(p) for p in to_phones if p.strip()]
    norm_phones = [p for p in norm_phones if p]
    if not norm_phones:
        return False

    # 1. Fast2SMS (Indian SMS Gateway)
    fast2sms_key = settings.FAST2SMS_API_KEY.strip() if getattr(settings, "FAST2SMS_API_KEY", None) else ""
    if fast2sms_key:
        url = "https://www.fast2sms.com/dev/bulkV2"
        headers = {"authorization": fast2sms_key}
        phone_nums = [p.lstrip("+").removeprefix("91") if len(p.lstrip("+")) > 10 else p.lstrip("+") for p in norm_phones]
        payload = {
            "route": "q",
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": ",".join(phone_nums),
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, data=payload, headers=headers)
                if resp.status_code == 200:
                    logger.info("📱 [Fast2SMS] Sent to %s", phone_nums)
                    return True
                else:
                    logger.error("📱 [Fast2SMS Error] Status %d: %s", resp.status_code, resp.text)
        except Exception as e:
            logger.error("📱 [Fast2SMS Exception] %s", e)

    # 2. MSG91 (Indian SMS Gateway)
    msg91_key = settings.MSG91_AUTH_KEY.strip() if getattr(settings, "MSG91_AUTH_KEY", None) else ""
    if msg91_key:
        url = "https://api.msg91.com/api/sendhttp.php"
        sender_id = getattr(settings, "MSG91_SENDER_ID", "") or "AGBMRK"
        phone_nums = [p.lstrip("+") for p in norm_phones]
        params = {
            "authkey": msg91_key,
            "mobiles": ",".join(phone_nums),
            "message": message,
            "sender": sender_id,
            "route": "4",
            "country": "91",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    logger.info("📱 [MSG91] Sent to %s", phone_nums)
                    return True
                else:
                    logger.error("📱 [MSG91 Error] Status %d: %s", resp.status_code, resp.text)
        except Exception as e:
            logger.error("📱 [MSG91 Exception] %s", e)

    # 3. Twilio SMS
    account_sid = settings.TWILIO_ACCOUNT_SID.strip() if settings.TWILIO_ACCOUNT_SID else ""
    auth_token = settings.TWILIO_AUTH_TOKEN.strip() if settings.TWILIO_AUTH_TOKEN else ""
    from_sms = settings.TWILIO_SMS_FROM.strip() if settings.TWILIO_SMS_FROM else ""

    if account_sid and auth_token and from_sms:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        all_success = True

        async with httpx.AsyncClient(timeout=10.0) as client:
            for phone in norm_phones:
                data = {
                    "From": from_sms,
                    "To": phone,
                    "Body": message,
                }
                try:
                    resp = await client.post(url, data=data, auth=(account_sid, auth_token))
                    if resp.status_code in (200, 201):
                        logger.info("📱 [Twilio SMS] Sent to %s", phone)
                    else:
                        logger.error("📱 [Twilio SMS Error] Status %d: %s", resp.status_code, resp.text)
                        all_success = False
                except Exception as e:
                    logger.error("📱 [Twilio SMS Exception] %s: %s", phone, e)
                    all_success = False
        return all_success

    # Fallback mock logging when credentials are not configured
    logger.info("📱 [SMS Mock] Credentials not configured. Would send to %s: %s", norm_phones, message)
    print(f"📱 [SMS Mock] Sent to {norm_phones}: {message}")
    return True


async def dispatch_outlet_alert(
    outlet: Any,
    title: str,
    message: str,
    details: dict[str, Any] | None = None,
    channels: list[str] | None = None,
) -> dict[str, Any]:
    """
    Orchestrates alert dispatch to an outlet's configured alert emails and alert phones.
    Sends Resend Email, WhatsApp, and SMS messages.
    """
    recipient_emails = list(getattr(outlet, "notification_emails", []) or [])
    recipient_phones = list(getattr(outlet, "notification_phones", []) or [])
    outlet_name = getattr(outlet, "name", "Store")

    requested_channels = channels or ["EMAIL", "WHATSAPP", "SMS"]
    dispatched_channels: list[str] = ["IN_APP"]

    # 1. Resend Email Dispatch
    if "EMAIL" in requested_channels and recipient_emails:
        subject = f"[{outlet_name} Alert] {title}"
        html_content = build_alert_email_html(
            title=title,
            message=message,
            outlet_name=outlet_name,
            details=details,
        )
        text_content = f"{title}\n\n{message}\n\nStore: {outlet_name}"
        email_ok = await send_resend_email(
            to_emails=recipient_emails,
            subject=subject,
            html_body=html_content,
            text_body=text_content,
        )
        if email_ok:
            dispatched_channels.append("EMAIL")

    # 2. WhatsApp Dispatch
    if "WHATSAPP" in requested_channels and recipient_phones:
        wa_text = f"🚨 *{title}*\n\n{message}\n\n📍 *Store:* {outlet_name}"
        wa_ok = await send_whatsapp_alert(
            to_phones=recipient_phones,
            message=wa_text,
        )
        if wa_ok:
            dispatched_channels.append("WHATSAPP")

    # 3. SMS Text Message Dispatch
    if "SMS" in requested_channels and recipient_phones:
        sms_text = f"[{outlet_name}] {title}: {message}"
        sms_ok = await send_sms_alert(
            to_phones=recipient_phones,
            message=sms_text,
        )
        if sms_ok:
            dispatched_channels.append("SMS")

    return {
        "dispatched_channels": dispatched_channels,
        "recipient_emails": recipient_emails,
        "recipient_phones": recipient_phones,
        "status": "SUCCESS",
    }
