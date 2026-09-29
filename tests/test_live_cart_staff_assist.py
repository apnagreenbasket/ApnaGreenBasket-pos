"""
Tests for Live Draft Cart, Staff Assistance, Customer WebSocket Sync, and Staff Incentive Attribution.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from app.models.enums import RoleEnum
from app.services import cart_service
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_cart_service_basic_ops(db_session):
    outlet = await create_test_outlet(db_session)
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Fresh Apples", price=Decimal("120.00"))
    await db_session.commit()

    session_id = uuid.uuid4()
    outlet_id = outlet.id

    # Get empty cart
    cart = await cart_service.get_cart(session_id)
    assert cart["session_id"] == str(session_id)
    assert len(cart["items"]) == 0
    assert cart["subtotal"] == 0.0

    # Add item by customer
    cart = await cart_service.add_or_update_item(
        db=db_session,
        session_id=session_id,
        outlet_id=outlet_id,
        menu_item_id=item.id,
        quantity=Decimal("2.0"),
        added_by="customer",
    )
    assert len(cart["items"]) == 1
    assert cart["items"][0]["quantity"] == 2.0
    assert cart["items"][0]["added_by"] == "customer"
    assert cart["subtotal"] == float(item.price * 2)

    # Staff adds another quantity of the same item
    staff_id = uuid.uuid4()
    cart = await cart_service.add_or_update_item(
        db=db_session,
        session_id=session_id,
        outlet_id=outlet_id,
        menu_item_id=item.id,
        quantity=Decimal("1.0"),
        added_by="staff",
        staff_id=staff_id,
        staff_name="Rajesh Staff",
    )
    assert len(cart["items"]) == 1
    assert cart["items"][0]["quantity"] == 3.0
    assert cart["items"][0]["added_by"] == "staff"
    assert cart["items"][0]["added_by_staff_id"] == str(staff_id)
    assert cart["items"][0]["added_by_staff_name"] == "Rajesh Staff"

    # Remove item
    item_id = cart["items"][0]["item_id"]
    cart = await cart_service.remove_item(session_id, item_id)
    assert len(cart["items"]) == 0

    # Clear cart
    await cart_service.clear_cart(session_id)
    cart = await cart_service.get_cart(session_id)
    assert len(cart["items"]) == 0


@pytest.mark.asyncio
async def test_staff_assist_by_basket_number(client, db_session):
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Mango Juice", price=Decimal("45.00"))
    await db_session.commit()
    headers = get_auth_headers(admin, outlet)

    # Start customer session on Basket 7
    start_res = await client.post("/api/sessions/start", json={
        "outlet_slug": outlet.slug,
        "basket_number": "7",
        "customer_name": "Alice",
    })
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]

    # Staff adds item by basket_number "7"
    assist_res = await client.post(
        "/api/admin/sessions/baskets/7/add-items",
        json={
            "items": [{
                "menu_item_id": str(item.id),
                "quantity": 2,
            }],
        },
        headers=headers,
    )
    assert assist_res.status_code == 201
    res_data = assist_res.json()
    assert res_data["basket_number"] == "7"

    # Customer fetches live cart and sees staff item
    cart_res = await client.get(f"/api/sessions/{session_id}/cart")
    assert cart_res.status_code == 200
    cart_data = cart_res.json()
    assert len(cart_data["items"]) == 1
    assert cart_data["items"][0]["added_by"] == "staff"
