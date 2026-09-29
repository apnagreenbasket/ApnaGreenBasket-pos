"""
FastAPI application factory with lifespan events.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.core.rate_limit import limiter
from app.core.redis import close_redis

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: Synchronize superadmin credentials directly from .env configuration
    try:
        import uuid
        from sqlalchemy import func, select
        from app.core.security import hash_password
        from app.database import async_session_factory
        from app.models.enums import RoleEnum
        from app.models.user import User

        target_email = (settings.SUPERADMIN_EMAIL or "official@apnagreenbasket.com").strip().lower()
        target_password = settings.SUPERADMIN_PASSWORD or "supersecret123"

        async with async_session_factory() as db:
            # 1. Look for user matching target_email
            result = await db.execute(
                select(User).where(func.lower(User.email) == target_email)
            )
            user = result.scalar_one_or_none()

            if user:
                # Account already setup — preserve existing DB password so in-app password changes/resets are kept
                if user.role != RoleEnum.SUPERADMIN or not user.is_active:
                    user.role = RoleEnum.SUPERADMIN
                    user.is_active = True
                    user.status = "active"
                    await db.commit()
                print("========================================")
                print(f"✅ [Startup] Superadmin account verified: {target_email}")
                print("========================================")
            else:
                # 2. Setup phase: check if initial placeholder superadmin exists from first boot
                sa_result = await db.execute(
                    select(User).where(User.role == RoleEnum.SUPERADMIN)
                )
                existing_sa = sa_result.scalar_one_or_none()
                if existing_sa:
                    # Setup phase: transition initial placeholder to .env credentials
                    existing_sa.email = target_email
                    existing_sa.password_hash = hash_password(target_password)
                    existing_sa.is_active = True
                    existing_sa.status = "active"
                    await db.commit()
                    print("========================================")
                    print(f"🔑 [Setup Phase] Configured initial Superadmin from .env:")
                    print(f"   Email:    {target_email}")
                    print("========================================")
                else:
                    # 3. Setup phase: create fresh Superadmin user from .env credentials
                    db.add(
                        User(
                            id=uuid.uuid4(),
                            email=target_email,
                            name="Super Admin",
                            password_hash=hash_password(target_password),
                            role=RoleEnum.SUPERADMIN,
                            outlet_id=None,
                            is_active=True,
                            status="active",
                        )
                    )
                    await db.commit()
                    print("========================================")
                    print(f"🔑 [Setup Phase] Created new Superadmin from .env:")
                    print(f"   Email:    {target_email}")
                    print("========================================")
    except Exception as err:
        print(f"[Startup Warning] Could not synchronize superadmin from .env: {err}")

    # Start background auto-schedulers (cloud mode only — not needed locally)
    import asyncio
    scheduler_task = None
    notification_scheduler_task = None
    if settings.RUNTIME_MODE != "local":
        from app.database import async_session_factory
        from app.services.evening_scheduler import run_evening_scheduler
        from app.services.notification_service import run_notification_scheduler

        scheduler_task = asyncio.create_task(
            run_evening_scheduler(async_session_factory)
        )
        notification_scheduler_task = asyncio.create_task(
            run_notification_scheduler(async_session_factory, interval_seconds=300)
        )
    else:
        # Start local sync worker
        from app.services.local_sync_worker import sync_worker
        sync_worker.start()

    yield

    # Shutdown background tasks
    if settings.RUNTIME_MODE == "local":
        from app.services.local_sync_worker import sync_worker
        await sync_worker.stop()
        
    if scheduler_task:
        scheduler_task.cancel()
    if notification_scheduler_task:
        notification_scheduler_task.cancel()
    try:
        if scheduler_task:
            await scheduler_task
    except asyncio.CancelledError:
        pass
    try:
        if notification_scheduler_task:
            await notification_scheduler_task
    except asyncio.CancelledError:
        pass
    await close_redis()


def create_app() -> FastAPI:
    """Build the FastAPI application with all routers and middleware."""
    app = FastAPI(
        title="ApnaGreen Basket API",
        description="Multi-outlet fruits, vegetables & drinks mart platform",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    cors_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins if cors_origins else ["*"],
        allow_credentials=True if "*" not in cors_origins else False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Rate limiting ────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Global unhandled exception handler ────────────────────────────
    import logging
    import traceback
    from fastapi import Request
    from fastapi.responses import JSONResponse

    app_logger = logging.getLogger("app.main")

    @app.exception_handler(Exception)
    async def global_unhandled_exception_handler(request: Request, exc: Exception):
        app_logger.error(
            "Unhandled server exception on %s %s: %s\n%s",
            request.method,
            request.url,
            exc,
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal Server Error: {str(exc)}"},
        )

    # ── Routers ──────────────────────────────────────────────────────
    from app.routers.auth import router as auth_router
    from app.routers.admin.outlets import router as outlets_router
    from app.routers.admin.categories import router as categories_router
    from app.routers.admin.menu_items import router as menu_items_router
    from app.routers.admin.variants import router as variants_router
    from app.routers.admin.orders import router as orders_admin_router
    from app.routers.admin.inventory import router as inventory_router
    from app.routers.admin.staff import router as staff_router
    from app.routers.admin.analytics import router as analytics_router
    from app.routers.admin.billing import router as billing_router
    from app.routers.admin.customers import router as customers_router
    from app.routers.admin.sessions import router as admin_sessions_router
    from app.routers.admin.catalogues import router as catalogues_router
    from app.routers.admin.notifications import router as notifications_router
    from app.routers.admin.bulk_operations import router as bulk_operations_router
    from app.routers.public.menu import router as public_menu_router
    from app.routers.public.orders import router as public_orders_router
    from app.routers.public.sessions import router as sessions_router
    from app.routers.public.cart import router as cart_router
    from app.routers.webhooks.razorpay import router as razorpay_router
    from app.routers.ws import router as ws_router
    from app.routers.upload import router as upload_router

    app.include_router(auth_router)
    app.include_router(outlets_router)
    app.include_router(categories_router)
    app.include_router(menu_items_router)
    app.include_router(variants_router)
    app.include_router(orders_admin_router)
    app.include_router(inventory_router)
    app.include_router(staff_router)
    app.include_router(analytics_router)
    app.include_router(billing_router)
    app.include_router(customers_router)
    app.include_router(admin_sessions_router)
    app.include_router(catalogues_router)
    app.include_router(notifications_router)
    app.include_router(bulk_operations_router)
    app.include_router(public_menu_router)
    app.include_router(public_orders_router)
    app.include_router(sessions_router)
    app.include_router(cart_router)
    app.include_router(razorpay_router)
    app.include_router(ws_router)
    app.include_router(upload_router)

    # ── Cloud-only sync routes ───────────────────────────────────────
    if settings.RUNTIME_MODE == "cloud":
        from app.routers.admin.sync import router as sync_router
        app.include_router(sync_router)

    # ── Local-only routes (seed + action queue only) ─────────────────
    if settings.is_local:
        from app.routers.local.queue import router as local_queue_router
        app.include_router(local_queue_router)

    # ── Serve Uploaded Static Files (Legacy Compatibility) ───────────
    from pathlib import Path
    from fastapi.staticfiles import StaticFiles
    upload_path = Path("uploads")
    if upload_path.is_dir():
        app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

    # ── Health check ─────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "healthy", "version": "0.1.1", "auto_deploy": True}

    # ── Admin Dashboard (sqladmin) ───────────────────────────────────
    from app.database import engine
    from app.admin_setup import setup_admin
    setup_admin(app, engine)

    return app


app = create_app()
