"""
Unit tests for the Alert Dispatch Service (Resend Email, WhatsApp, SMS multi-provider dispatch).
"""

import pytest
from unittest.mock import patch, MagicMock
from app.services.alert_dispatch_service import (
    _normalize_phone_number,
    build_alert_email_html,
    send_resend_email,
    send_whatsapp_alert,
    send_sms_alert,
    dispatch_outlet_alert,
)


def test_normalize_phone_number():
    assert _normalize_phone_number("9876543210") == "+919876543210"
    assert _normalize_phone_number("+91 98765 43210") == "+919876543210"
    assert _normalize_phone_number("+14155552671") == "+14155552671"
    assert _normalize_phone_number("   ") == ""


def test_build_alert_email_html():
    html = build_alert_email_html(
        title="Batch Expiring in 2 Days",
        message="Basmati Rice 5kg batch #BAT-001 is expiring soon.",
        outlet_name="Main Branch",
        details={
            "item_name": "Basmati Rice 5kg",
            "batch_number": "BAT-001",
            "remaining_quantity": 40,
            "unit": "kg",
            "cost_per_unit": 120.0,
            "expiry_date": "2026-09-15T00:00:00",
        },
    )
    assert "ApnaGreen Basket" in html
    assert "Main Branch" in html
    assert "Basmati Rice 5kg" in html
    assert "BAT-001" in html
    assert "40 kg" in html


@pytest.mark.asyncio
async def test_send_resend_email_mock_fallback():
    # When RESEND_API_KEY is empty, it logs and returns True gracefully without failing
    with patch("app.services.alert_dispatch_service.settings.RESEND_API_KEY", ""):
        ok = await send_resend_email(
            to_emails=["test@example.com"],
            subject="Test Subject",
            html_body="<p>Test</p>",
            text_body="Test",
        )
        assert ok is True


@pytest.mark.asyncio
async def test_send_whatsapp_mock_fallback():
    # When no WhatsApp credentials exist, it gracefully logs and returns True
    with patch("app.services.alert_dispatch_service.settings.TWILIO_ACCOUNT_SID", ""), \
         patch("app.services.alert_dispatch_service.settings.META_WHATSAPP_TOKEN", ""):
        ok = await send_whatsapp_alert(
            to_phones=["+919876543210"],
            message="Test WhatsApp Alert",
        )
        assert ok is True


@pytest.mark.asyncio
async def test_send_sms_mock_fallback():
    # When no SMS credentials exist, it gracefully logs and returns True
    with patch("app.services.alert_dispatch_service.settings.FAST2SMS_API_KEY", ""), \
         patch("app.services.alert_dispatch_service.settings.MSG91_AUTH_KEY", ""), \
         patch("app.services.alert_dispatch_service.settings.TWILIO_ACCOUNT_SID", ""):
        ok = await send_sms_alert(
            to_phones=["+919876543210"],
            message="Test SMS Alert",
        )
        assert ok is True


@pytest.mark.asyncio
async def test_dispatch_outlet_alert_coordination():
    mock_outlet = MagicMock()
    mock_outlet.name = "Downtown Store"
    mock_outlet.notification_emails = ["admin1@example.com", "manager@example.com"]
    mock_outlet.notification_phones = ["+919876543210"]

    res = await dispatch_outlet_alert(
        outlet=mock_outlet,
        title="Shelf Life Reached",
        message="Item reached 24h shelf life.",
        details={"item_name": "Fresh Milk", "remaining_quantity": 10, "unit": "liters"},
        channels=["EMAIL", "WHATSAPP", "SMS"],
    )

    assert res["status"] == "SUCCESS"
    assert "IN_APP" in res["dispatched_channels"]
    assert "EMAIL" in res["dispatched_channels"]
    assert "WHATSAPP" in res["dispatched_channels"]
    assert "SMS" in res["dispatched_channels"]
    assert len(res["recipient_emails"]) == 2
    assert len(res["recipient_phones"]) == 1
