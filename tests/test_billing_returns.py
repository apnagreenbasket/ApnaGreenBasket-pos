"""
Tests for Customer Returns API — Bill-linked returns and Direct unbilled returns.
"""

import pytest
from httpx import AsyncClient
from decimal import Decimal
from app.models.enums import RoleEnum
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_customer_returns_api(client: AsyncClient, db_session):
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    await db_session.commit()
    admin_auth_headers = get_auth_headers(admin, outlet)

    # 1. Test direct un-billed return endpoint
    return_payload = {
        "order_id": None,
        "customer_name": "Test Return Customer",
        "customer_phone": "9998887770",
        "return_items": [
            {
                "menu_item_id": None,
                "item_name": "Direct Return Item 1",
                "quantity": 2.0,
                "unit_price": 45.0,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Direct return without bill test",
    }

    res = await client.post(
        "/api/billing/returns",
        json=return_payload,
        headers=admin_auth_headers,
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["status"] == "PROCESSED"
    assert data["return_number"].startswith("RET-")
    assert data["total_refund_amount"] == 90.0
    assert data["original_bill_number"] == "Direct Return (No Bill)"

    # 2. Test GET /api/billing/returns list history endpoint
    res_list = await client.get(
        "/api/billing/returns",
        headers=admin_auth_headers,
    )
    assert res_list.status_code == 200
    returns = res_list.json()
    assert len(returns) >= 1
    matching = next((r for r in returns if r["return_number"] == data["return_number"]), None)
    assert matching is not None
    assert matching["total_refund_amount"] == 90.0
    assert matching["customer_name"] == "Test Return Customer"
