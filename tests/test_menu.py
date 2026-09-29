"""
Menu tests — CRUD, tenant isolation, cache invalidation, public endpoint.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.enums import PaymentModeEnum, RoleEnum
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    create_test_variant,
    get_auth_headers,
)


@pytest.mark.asyncio
class TestCategoryAdmin:
    """Category CRUD tests."""

    async def test_create_category(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post(
            "/api/admin/categories",
            json={"name": "Fruits", "display_order": 1},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Fruits"
        assert data["outlet_id"] == str(outlet.id)

    async def test_list_categories(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        await create_test_category(db_session, outlet, name="Fruits")
        await create_test_category(db_session, outlet, name="Drinks")
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.get("/api/admin/categories", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_tenant_isolation(self, client, db_session):
        """Categories from another outlet must NOT be visible."""
        o1 = await create_test_outlet(db_session, slug="o1", name="O1")
        o2 = await create_test_outlet(db_session, slug="o2", name="O2")
        u1 = await create_test_user(db_session, o1, email="u1@test.com")
        cat2 = await create_test_category(db_session, o2, name="Secret Menu")
        await db_session.commit()

        headers = get_auth_headers(u1, o1)
        # Try to access o2's category from o1's token — should 404
        resp = await client.get(
            f"/api/admin/categories/{cat2.id}",
            headers=headers,
        )
        assert resp.status_code == 404

    async def test_delete_category(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.delete(
            f"/api/admin/categories/{cat.id}",
            headers=headers,
        )
        assert resp.status_code == 204


@pytest.mark.asyncio
class TestMenuItemAdmin:
    """MenuItem CRUD tests."""

    async def test_create_menu_item(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post(
            "/api/admin/menu-items",
            json={
                "category_id": str(cat.id),
                "name": "Fresh Apples",
                "price": "9.99",
                "is_available": True,
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["price"] == "9.99"
        assert data["outlet_id"] == str(outlet.id)

    async def test_toggle_availability(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.patch(
            f"/api/admin/menu-items/{item.id}",
            json={"is_available": False},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_available"] is False


@pytest.mark.asyncio
class TestVariantAdmin:
    """Variant CRUD tests."""

    async def test_create_variant(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post(
            f"/api/admin/menu-items/{item.id}/variants",
            json={"name": "1 kg Pack", "price_delta": "2.50"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "1 kg Pack"
        assert data["price_delta"] == "2.50"


@pytest.mark.asyncio
class TestPublicMenu:
    """Public menu endpoint tests."""

    async def test_get_public_menu(self, client, db_session):
        outlet = await create_test_outlet(db_session)
        cat = await create_test_category(db_session, outlet)
        item = await create_test_menu_item(db_session, outlet, cat)
        variant = await create_test_variant(db_session, item)
        await db_session.commit()

        resp = await client.get(f"/api/public/menu/{outlet.slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["outlet_name"] == outlet.name
        assert len(data["categories"]) == 1
        assert len(data["categories"][0]["items"]) == 1
        assert len(data["categories"][0]["items"][0]["variants"]) == 1

    async def test_menu_not_found(self, client, db_session):
        resp = await client.get("/api/public/menu/nonexistent-slug")
        assert resp.status_code == 404
