"""
WebSocket service — connection manager + Redis pub/sub fan-out.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict

from fastapi import WebSocket

from app.core.redis import get_redis


class ConnectionManager:
    """
    Manages WebSocket connections per outlet.
    Uses Redis pub/sub for multi-instance fan-out — in-memory dicts only
    track connections on the current instance.
    """

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = defaultdict(list)
        self._subscriber_tasks: dict[uuid.UUID, asyncio.Task] = {}

    async def connect(
        self, websocket: WebSocket, outlet_id: uuid.UUID
    ) -> None:
        """Accept connection and subscribe to Redis channel."""
        await websocket.accept()
        self._connections[outlet_id].append(websocket)

        # Start Redis subscriber for this outlet if not already running
        if outlet_id not in self._subscriber_tasks:
            task = asyncio.create_task(
                self._redis_subscriber(outlet_id)
            )
            self._subscriber_tasks[outlet_id] = task

    async def disconnect(
        self, websocket: WebSocket, outlet_id: uuid.UUID
    ) -> None:
        """Remove connection. Stop subscriber if no connections remain."""
        if websocket in self._connections[outlet_id]:
            self._connections[outlet_id].remove(websocket)

        # Clean up if no more connections for this outlet
        if not self._connections[outlet_id]:
            del self._connections[outlet_id]
            task = self._subscriber_tasks.pop(outlet_id, None)
            if task:
                task.cancel()

    async def broadcast_to_outlet(
        self,
        outlet_id: uuid.UUID,
        event_type: str,
        data: dict,
    ) -> None:
        """
        Publish event via Redis pub/sub — reaches all app instances.
        Each instance's subscriber will forward to its local connections.
        """
        r = await get_redis()
        message = json.dumps({
            "event": event_type,
            "data": data,
        }, default=str)
        await r.publish(f"outlet:{outlet_id}", message)

    async def _redis_subscriber(self, outlet_id: uuid.UUID) -> None:
        """
        Subscribe to Redis channel and forward messages to local WebSocket
        connections. Runs as a background task per outlet.
        """
        r = await get_redis()
        pubsub = r.pubsub()
        channel = f"outlet:{outlet_id}"

        try:
            await pubsub.subscribe(channel)

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                # Forward to all local connections for this outlet
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")

                dead_connections: list[WebSocket] = []
                for ws in self._connections.get(outlet_id, []):
                    try:
                        await ws.send_text(data)
                    except Exception:
                        dead_connections.append(ws)

                # Clean up dead connections
                for ws in dead_connections:
                    await self.disconnect(ws, outlet_id)

        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    async def _send_local(
        self, outlet_id: uuid.UUID, message: str
    ) -> None:
        """Send to all locally-connected WebSockets for an outlet."""
        dead: list[WebSocket] = []
        for ws in self._connections.get(outlet_id, []):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws, outlet_id)


# Singleton — shared across the app
ws_manager = ConnectionManager()
manager = ws_manager


# ── Convenience broadcast functions ──────────────────────────────────────


async def broadcast_new_order_paid(
    outlet_id: uuid.UUID, order_id: uuid.UUID
) -> None:
    """Broadcast NEW_ORDER_PAID event to kitchen/admin dashboard."""
    await ws_manager.broadcast_to_outlet(
        outlet_id,
        "NEW_ORDER_PAID",
        {"order_id": str(order_id)},
    )


async def broadcast_verification_needed(
    outlet_id: uuid.UUID, order_id: uuid.UUID, basket_number: str
) -> None:
    """Broadcast VERIFICATION_NEEDED for Mode B 'I have paid' click."""
    await ws_manager.broadcast_to_outlet(
        outlet_id,
        "VERIFICATION_NEEDED",
        {"order_id": str(order_id), "basket_number": basket_number},
    )


async def broadcast_order_status_changed(
    outlet_id: uuid.UUID,
    order_id: uuid.UUID,
    old_status: str,
    new_status: str,
) -> None:
    """Broadcast ORDER_STATUS_CHANGED on any state transition."""
    await ws_manager.broadcast_to_outlet(
        outlet_id,
        "ORDER_STATUS_CHANGED",
        {
            "order_id": str(order_id),
            "old_status": old_status,
            "new_status": new_status,
        },
    )


async def broadcast_session_changed(
    outlet_id: uuid.UUID,
    session_id: uuid.UUID,
    action: str = "CREATED",
) -> None:
    """Broadcast SESSION_CHANGED on session creation, extension, or termination."""
    await ws_manager.broadcast_to_outlet(
        outlet_id,
        "SESSION_CHANGED",
        {"session_id": str(session_id), "action": action},
    )


async def broadcast_cart_updated(
    session_id: uuid.UUID,
    outlet_id: uuid.UUID,
    cart_data: dict,
) -> None:
    """
    Broadcast CART_UPDATED event to customer's session channel (session:{session_id})
    and store outlet channel (outlet:{outlet_id}).
    """
    r = await get_redis()
    message = json.dumps({
        "event": "CART_UPDATED",
        "data": cart_data,
    }, default=str)

    # Publish to customer session WS channel
    await r.publish(f"session:{session_id}", message)

    # Also publish summary event to outlet WS channel
    await r.publish(
        f"outlet:{outlet_id}",
        json.dumps({
            "event": "SESSION_CART_UPDATED",
            "data": {
                "session_id": str(session_id),
                "item_count": cart_data.get("item_count", 0),
                "subtotal": cart_data.get("subtotal", 0.0),
            },
        }, default=str)
    )


async def broadcast_catalog_updated(
    outlet_id: uuid.UUID,
    reason: str = "CATALOG_MODIFIED",
    item_id: str | None = None,
) -> None:
    """Broadcast CATALOG_UPDATED event to all connected admin/billing terminals for this outlet."""
    await ws_manager.broadcast_to_outlet(
        outlet_id,
        "CATALOG_UPDATED",
        {"reason": reason, "item_id": str(item_id) if item_id else None},
    )

