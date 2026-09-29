"""
Redis connection pool — with automatic in-memory Mock Redis fallback
for zero-dependency local development.
"""

from __future__ import annotations

import asyncio
from typing import Any

import redis.asyncio as redis
from redis.exceptions import ConnectionError, RedisError

from app.config import get_settings

settings = get_settings()

redis_pool: Any | None = None


class AsyncMockPubSub:
    """In-memory PubSub mock for WebSockets."""

    def __init__(self, channel_subscribers: dict[str, list[asyncio.Queue]]):
        self._subs: dict[str, list[asyncio.Queue]] = channel_subscribers
        self._my_queues: list[tuple[str, asyncio.Queue]] = []

    async def subscribe(self, channel: str) -> None:
        q = asyncio.Queue()
        if channel not in self._subs:
            self._subs[channel] = []
        self._subs[channel].append(q)
        self._my_queues.append((channel, q))

    async def unsubscribe(self, channel: str) -> None:
        for ch, q in list(self._my_queues):
            if ch == channel:
                if ch in self._subs and q in self._subs[ch]:
                    self._subs[ch].remove(q)
                self._my_queues.remove((ch, q))

    async def listen(self):
        while True:
            for ch, q in self._my_queues:
                try:
                    data = q.get_nowait()
                    yield {"type": "message", "channel": ch, "data": data}
                except asyncio.QueueEmpty:
                    pass
            await asyncio.sleep(0.1)

    async def close(self) -> None:
        for ch, q in self._my_queues:
            if ch in self._subs and q in self._subs[ch]:
                self._subs[ch].remove(q)


class AsyncMockRedis:
    """In-memory Mock Redis replacing real Redis during local dev."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._locks: set[str] = set()
        self._channel_subs: dict[str, list[asyncio.Queue]] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        nx: bool = False,
    ) -> bool:
        if nx and key in self._store:
            return False
        self._store[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self._store:
                del self._store[k]
                count += 1
        return count

    async def keys(self, pattern: str = "*") -> list[str]:
        import fnmatch
        return [k for k in self._store.keys() if fnmatch.fnmatch(k, pattern)]

    async def ttl(self, key: str) -> int:
        return 900 if key in self._store else -2

    async def flushdb(self) -> bool:
        self._store.clear()
        return True

    async def publish(self, channel: str, message: str) -> int:
        queues = self._channel_subs.get(channel, [])
        for q in queues:
            await q.put(message)
        return len(queues)

    def pubsub(self) -> AsyncMockPubSub:
        return AsyncMockPubSub(self._channel_subs)

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass


mock_redis_instance = AsyncMockRedis()


async def get_redis() -> Any:
    """Get real Redis or fallback gracefully to AsyncMockRedis."""
    global redis_pool
    import sys
    if "pytest" in sys.modules or settings.APP_ENV == "test":
        return mock_redis_instance

    if redis_pool is not None:
        return redis_pool

    try:
        pool = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
            socket_timeout=1.0,
        )
        await pool.ping()
        redis_pool = pool
        return redis_pool
    except (ConnectionError, RedisError, OSError):
        # Fallback to in-memory Mock Redis for zero-dependency local dev
        redis_pool = mock_redis_instance
        return redis_pool


async def get_redis_bytes() -> Any:
    """Get Redis bytes or mock fallback."""
    return await get_redis()


async def close_redis() -> None:
    """Cleanly close Redis connection."""
    global redis_pool
    if redis_pool is not None and hasattr(redis_pool, "close"):
        await redis_pool.close()
        redis_pool = None
