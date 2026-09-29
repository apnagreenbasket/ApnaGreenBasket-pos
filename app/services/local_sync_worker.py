"""
Autonomous background worker for the local POS sidecar.
Constantly pushes pending actions to the cloud and pulls down catalog snapshots.
Runs entirely independently of the frontend UI.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
import os
from datetime import datetime, timezone
import httpx

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token
from app.database import async_session_factory
from app.models.local_action_queue import LocalActionQueue
from app.schemas.sync import SnapshotResponse

logger = logging.getLogger("local_sync_worker")
settings = get_settings()


class LocalSyncWorker:
    def __init__(self):
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._last_snapshot_at: datetime | None = None
        self._client: httpx.AsyncClient | None = None

        # Hardcode a background sync user ID so actions have a "staff_id"
        self._worker_user_id = uuid.uuid4()
        
        # Get config
        self._cloud_url = os.environ.get("NEXT_PUBLIC_CLOUD_API_URL", "http://127.0.0.1:8000")
        self._outlet_id = settings.LOCAL_OUTLET_ID

    def start(self):
        if not settings.is_local:
            logger.info("RUNTIME_MODE is not local; Sync Worker will not start.")
            return
        if not self._cloud_url or not self._outlet_id:
            logger.warning("CLOUD_BACKEND_URL or LOCAL_OUTLET_ID missing; Sync Worker disabled.")
            return

        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"Local Sync Worker started. Syncing to {self._cloud_url} for outlet {self._outlet_id}")

    async def stop(self):
        if self._task:
            self._stop_event.set()
            await self._task
            self._task = None
            if self._client:
                await self._client.aclose()
            logger.info("Local Sync Worker stopped.")

    def _get_auth_headers(self) -> dict:
        # Forge an admin token that the cloud will accept, using the shared JWT_SECRET_KEY
        token = create_access_token(
            user_id=self._worker_user_id,
            outlet_id=uuid.UUID(self._outlet_id),
            role="OUTLET_ADMIN"  # Needs to be a valid RoleEnum member like OUTLET_ADMIN
        )
        return {"Authorization": f"Bearer {token}"}

    async def _run_loop(self):
        self._client = httpx.AsyncClient(timeout=30.0)
        
        # Pull initial snapshot on startup
        await self._pull_snapshot()

        while not self._stop_event.is_set():
            try:
                await self._push_actions()
                
                # Recache every 5 minutes, or retry if we never got an initial snapshot
                if not self._last_snapshot_at:
                    await self._pull_snapshot()
                else:
                    elapsed = (datetime.now(timezone.utc) - self._last_snapshot_at).total_seconds()
                    if elapsed > 300:
                        await self._pull_snapshot()
            except Exception as e:
                logger.error(f"Sync Worker Loop Error: {e}")
            
            # Sleep in short bursts so we can exit cleanly
            for _ in range(10):
                if self._stop_event.is_set():
                    break
                await asyncio.sleep(1)

    async def _push_actions(self):
        async with async_session_factory() as db:
            # Get pending actions
            result = await db.execute(
                select(LocalActionQueue)
                .where(LocalActionQueue.synced == False)
                .order_by(LocalActionQueue.created_at.asc())
                .limit(50)
            )
            actions = result.scalars().all()
            if not actions:
                return

            logger.info(f"Pushing {len(actions)} offline actions to cloud...")
            
            # Format payload
            payload = {
                "actions": [
                    {
                        "client_action_id": a.client_action_id,
                        "action_type": a.action_type,
                        "action_timestamp": a.action_timestamp.isoformat(),
                        "payload": a.payload or {}
                    }
                    for a in actions
                ]
            }

            try:
                assert self._client is not None
                resp = await self._client.post(
                    f"{self._cloud_url.rstrip('/')}/api/admin/sync/outlets/{self._outlet_id}/sync/actions",
                    json=payload,
                    headers=self._get_auth_headers()
                )
                
                if resp.status_code in (200, 201):
                    # Mark as synced
                    ids = [a.client_action_id for a in actions]
                    await db.execute(
                        update(LocalActionQueue)
                        .where(LocalActionQueue.client_action_id.in_(ids))
                        .values(synced=True)
                    )
                    await db.commit()
                    logger.info(f"Successfully synced {len(actions)} actions.")
                else:
                    logger.warning(f"Cloud rejected actions payload: {resp.status_code} {resp.text}")
                    
            except httpx.RequestError as e:
                logger.warning(f"Failed to connect to cloud for pushing actions: {e}")


    async def _pull_snapshot(self):
        logger.info("Pulling latest snapshot from cloud...")
        url = f"{self._cloud_url.rstrip('/')}/api/admin/sync/outlets/{self._outlet_id}/snapshot"
        
        params = {}
        if self._last_snapshot_at:
            params["since"] = self._last_snapshot_at.isoformat()
            
        try:
            assert self._client is not None
            resp = await self._client.get(url, params=params, headers=self._get_auth_headers())
            if resp.status_code == 200:
                data = resp.json()
                snapshot_obj = SnapshotResponse(**data)
                
                # Natively call the local recache logic
                from app.services.recache_service import receive_snapshot
                async with async_session_factory() as db:
                    result = await receive_snapshot(snapshot_obj, db)
                    await db.commit()
                    
                self._last_snapshot_at = datetime.now(timezone.utc)
                logger.info(f"Snapshot applied successfully. Stats: {result['stats']}")
            else:
                logger.warning(f"Failed to fetch snapshot: {resp.status_code} {resp.text}")
        except httpx.RequestError as e:
            logger.warning(f"Failed to connect to cloud for snapshot: {e}")
        except Exception as e:
            logger.error(f"Error applying snapshot locally: {e}")

# Global instance
sync_worker = LocalSyncWorker()
