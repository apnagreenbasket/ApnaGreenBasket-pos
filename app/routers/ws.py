"""
WebSocket dashboard route.
Auth via short-lived ticket — JWTs must NEVER be passed as query params.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.security import create_ws_ticket, decode_token
from app.dependencies import AuthenticatedUser
from app.services.websocket_service import ws_manager

router = APIRouter(tags=["websocket"])


@router.post("/api/ws-ticket")
async def get_ws_ticket(current_user: AuthenticatedUser):
    """
    Issue a short-lived, single-use WebSocket ticket.
    The ticket is an opaque token with 60s TTL.
    Pass this in the WS query string instead of the JWT.
    """
    ticket = create_ws_ticket(
        user_id=current_user.user_id,
        role=current_user.role.value,
        outlet_id=current_user.outlet_id,
        ttl_seconds=60,
    )
    return {"ticket": ticket}


async def _handle_ws_connection(websocket: WebSocket, target_id: uuid.UUID):
    ticket = websocket.query_params.get("ticket")
    if not ticket:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token(ticket)
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if payload.get("type") != "ws_ticket":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    role = payload.get("role")
    if role != "SUPERADMIN":
        raw_tid = payload.get("outlet_id")
        if not raw_tid or uuid.UUID(raw_tid) != target_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await ws_manager.connect(websocket, target_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        await ws_manager.disconnect(websocket, target_id)


@router.websocket("/ws/mart/{outlet_id}")
@router.websocket("/ws/kitchen/{outlet_id}")
async def mart_websocket(websocket: WebSocket, outlet_id: uuid.UUID):
    """WebSocket endpoint for mart & grocery dashboard."""
    await _handle_ws_connection(websocket, outlet_id)


@router.websocket("/ws/session/{session_id}")
async def customer_session_websocket(websocket: WebSocket, session_id: uuid.UUID):
    """
    WebSocket endpoint for real-time customer session updates (live draft cart sync).
    Subscribes to Redis channel `session:{session_id}`.
    """
    from app.core.redis import get_redis
    import asyncio

    await websocket.accept()

    r = await get_redis()
    pubsub = r.pubsub()
    channel = f"session:{session_id}"

    try:
        await pubsub.subscribe(channel)

        async def _listen_redis():
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                await websocket.send_text(data)

        async def _listen_client():
            while True:
                client_msg = await websocket.receive_text()
                if client_msg == "ping":
                    await websocket.send_text("pong")

        listen_redis_task = asyncio.create_task(_listen_redis())
        listen_client_task = asyncio.create_task(_listen_client())

        done, pending = await asyncio.wait(
            [listen_redis_task, listen_client_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()

