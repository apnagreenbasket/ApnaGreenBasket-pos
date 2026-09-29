import pytest
from httpx import AsyncClient
from decimal import Decimal
from app.models.enums import RoleEnum
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    create_test_category,
    create_test_menu_item,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_customer_analytics_and_daily_cash_denominations(client: AsyncClient, db_session):
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Sample Product", price=Decimal("100.00"))
    await db_session.commit()
    admin_auth_headers = get_auth_headers(admin, outlet)

    # 1. Create a bill for customer
    bill_data = {
        "basket_number": "WALK-IN",
        "customer_name": "Test Customer",
        "customer_phone": "9876543210",
        "items": [
            {
                "menu_item_id": str(item.id),
                "quantity": 2,
                "unit_price": 100.0,
                "mrp": 120.0,
                "tax_rate": 5.0,
            }
        ],
    }
    res = await client.post("/api/billing/bills", json=bill_data, headers=admin_auth_headers)
    assert res.status_code == 200
    bill = res.json()
    bill_id = bill["id"]
    assert bill["tax_amount"] == 9.52  # Tax-inclusive: 200 - (200 / 1.05) = 9.52
    assert bill["total_amount"] == 200.0

    # 2. Mark bill paid with cash denominations
    mark_paid_data = {
        "payment_method": "CASH",
        "cash_denominations": {"500": 1},
    }
    res_paid = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        json=mark_paid_data,
        headers=admin_auth_headers,
    )
    assert res_paid.status_code == 200
    paid_bill = res_paid.json()
    assert paid_bill["status"] == "COMPLETED"
    assert paid_bill["customer_balance"] is not None

    # 3. Test customer analytics endpoint
    res_analytics = await client.get(
        "/api/admin/customers/analytics?phone=9876543210&period=all_time",
        headers=admin_auth_headers,
    )
    assert res_analytics.status_code == 200
    analytics = res_analytics.json()
    assert analytics["customer_phone"] == "9876543210"
    assert analytics["total_orders"] >= 1
    assert analytics["total_volume"] >= 200.0

    # 4. Test daily cash denominations endpoint
    res_denoms = await client.get(
        "/api/billing/daily-cash-denominations",
        headers=admin_auth_headers,
    )
    assert res_denoms.status_code == 200
    denoms = res_denoms.json()
    assert "denominations" in denoms
    assert denoms["denominations"].get("500") >= 1

    # 5. Test customer returns endpoint
    return_data = {
        "order_id": bill_id,
        "return_items": [
            {
                "order_item_id": paid_bill["items"][0]["id"],
                "quantity": 1,
                "reason": "CUSTOMER_RETURN",
            }
        ],
        "refund_payment_method": "CASH",
    }
    res_return = await client.post(
        "/api/billing/returns",
        json=return_data,
        headers=admin_auth_headers,
    )
    assert res_return.status_code == 200
    ret = res_return.json()
    assert ret["status"] == "PROCESSED"
    assert ret["total_refund_amount"] == 100.0
