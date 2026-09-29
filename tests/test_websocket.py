"""
WebSocket tests — ticket auth, connection, event delivery.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.security import create_ws_ticket
from app.models.enums import RoleEnum
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
class TestWebSocketTicket:
    """WebSocket ticket issuance tests."""

    async def test_get_ws_ticket(self, client, db_session):
        """Authenticated user can get a WS ticket."""
        outlet = await create_test_outlet(db_session)
        user = await create_test_user(db_session, outlet)
        await db_session.commit()

        headers = get_auth_headers(user, outlet)
        resp = await client.post("/api/ws-ticket", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "ticket" in data
        assert len(data["ticket"]) > 0

    async def test_ws_ticket_requires_auth(self, client):
        """WS ticket endpoint requires authentication."""
        resp = await client.post("/api/ws-ticket")
        assert resp.status_code == 401


class TestWebSocketAuth:
    """WebSocket connection auth tests (unit-level)."""

    def test_ws_ticket_creation(self):
        """WS ticket should be a valid JWT with ws_ticket type."""
        from app.core.security import decode_token

        user_id = uuid.uuid4()
        outlet_id = uuid.uuid4()
        ticket = create_ws_ticket(user_id, outlet_id, ttl_seconds=60)

        payload = decode_token(ticket)
        assert payload["type"] == "ws_ticket"
        assert payload["sub"] == str(user_id)
        assert payload["outlet_id"] == str(outlet_id)

    def test_ws_ticket_contains_jti(self):
        """Each WS ticket should have a unique JTI for single-use enforcement."""
        from app.core.security import decode_token

        t1 = create_ws_ticket(uuid.uuid4(), uuid.uuid4())
        t2 = create_ws_ticket(uuid.uuid4(), uuid.uuid4())

        p1 = decode_token(t1)
        p2 = decode_token(t2)

        assert p1["jti"] != p2["jti"]
