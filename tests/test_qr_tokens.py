import pytest
from httpx import AsyncClient
from tests.conftest import create_test_outlet


@pytest.mark.asyncio
async def test_qr_token_generation_and_resolution(client: AsyncClient, db_session):
    outlet = await create_test_outlet(db_session)
    await db_session.commit()

    # 1. Get or create QR token
    res = await client.get(f"/api/sessions/qr-token?outlet_slug={outlet.slug}&basket_number=5")
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    token = data["token"]
    assert len(token) > 20

    # 2. Resolve token
    res_resolve = await client.get(f"/api/sessions/resolve-token?token={token}")
    assert res_resolve.status_code == 200
    resolved = res_resolve.json()
    assert resolved["outlet_slug"] == outlet.slug
    assert resolved["basket_number"] == "5"


@pytest.mark.asyncio
async def test_invalid_qr_token_returns_404(client: AsyncClient):
    res = await client.get("/api/sessions/resolve-token?token=invalid_random_token_12345")
    assert res.status_code == 404
