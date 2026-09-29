"""
Tests for Item-Level Return Ledger API (/api/billing/returns/item-ledger).
"""

from datetime import datetime, timezone
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.enums import OrderStatusEnum, RoleEnum
from app.models.order import Order
from app.models.customer_return import CustomerReturn
from app.models.menu_item import MenuItem
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    create_test_category,
    create_test_menu_item,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_item_level_return_ledger_query_search_and_export(client: AsyncClient, db_session):
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    category = await create_test_category(db_session, outlet, name="Snacks & Chips")

    item1 = await create_test_menu_item(
        db_session,
        outlet,
        category,
        name="Lays Classic Salted",
        price=Decimal("30.00"),
        is_available=True,
    )
    item2 = await create_test_menu_item(
        db_session,
        outlet,
        category,
        name="Kurkure Masala Munch",
        price=Decimal("20.00"),
        is_available=True,
    )
    await db_session.commit()

    admin_headers = get_auth_headers(admin, outlet)

    # 1. Post a return with 2 distinct items
    return_payload = {
        "order_id": None,
        "customer_name": "Aman Sharma",
        "customer_phone": "9811223344",
        "return_items": [
            {
                "menu_item_id": str(item1.id),
                "item_name": "Lays Classic Salted",
                "quantity": 2.0,
                "unit_price": 30.0,
                "reason": "EXPIRED",
            },
            {
                "menu_item_id": str(item2.id),
                "item_name": "Kurkure Masala Munch",
                "quantity": 3.0,
                "unit_price": 20.0,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Expired chips and defective kurkure",
    }

    res_post = await client.post("/api/billing/returns", json=return_payload, headers=admin_headers)
    assert res_post.status_code == 200, f"Return post failed: {res_post.text}"
    ret_data = res_post.json()
    assert ret_data["total_refund_amount"] == 120.0  # 2*30 + 3*20 = 60 + 60 = 120

    # 2. Query Item Return Ledger
    res_ledger = await client.get("/api/billing/returns/item-ledger", headers=admin_headers)
    assert res_ledger.status_code == 200, f"Ledger fetch failed: {res_ledger.text}"
    ledger_data = res_ledger.json()

    assert "summary" in ledger_data
    assert "items" in ledger_data
    assert ledger_data["summary"]["total_line_items"] == 2
    assert ledger_data["summary"]["total_quantity_returned"] == 5.0
    assert ledger_data["summary"]["total_refund_amount"] == 120.0

    items = ledger_data["items"]
    assert len(items) == 2
    item_names = [it["item_name"] for it in items]
    assert "Lays Classic Salted" in item_names
    assert "Kurkure Masala Munch" in item_names

    lays = next(it for it in items if it["item_name"] == "Lays Classic Salted")
    assert lays["quantity"] == 2.0
    assert lays["unit_price"] == 30.0
    assert lays["line_refund"] == 60.0
    assert lays["reason"] == "EXPIRED"
    assert lays["customer_name"] == "Aman Sharma"
    assert lays["category_name"] == "Snacks & Chips"

    kurkure = next(it for it in items if it["item_name"] == "Kurkure Masala Munch")
    assert kurkure["quantity"] == 3.0
    assert kurkure["unit_price"] == 20.0
    assert kurkure["line_refund"] == 60.0
    assert kurkure["reason"] == "DEFECTIVE_PRODUCT"

    # 3. Test Search filtering
    res_search = await client.get("/api/billing/returns/item-ledger?search=Kurkure", headers=admin_headers)
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["summary"]["total_line_items"] == 1
    assert search_data["items"][0]["item_name"] == "Kurkure Masala Munch"

    # 4. Test Reason filtering
    res_reason = await client.get("/api/billing/returns/item-ledger?reason=EXPIRED", headers=admin_headers)
    assert res_reason.status_code == 200
    reason_data = res_reason.json()
    assert reason_data["summary"]["total_line_items"] == 1
    assert reason_data["items"][0]["item_name"] == "Lays Classic Salted"

    # 5. Test CSV Export
    res_csv = await client.get("/api/billing/returns/item-ledger?export=csv", headers=admin_headers)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    csv_text = res_csv.text
    assert "Lays Classic Salted" in csv_text
    assert "Kurkure Masala Munch" in csv_text
    assert "Aman Sharma" in csv_text
    assert "EXPIRED" in csv_text
