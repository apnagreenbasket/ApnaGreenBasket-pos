"""
Test configuration and shared fixtures.
Uses an in-memory SQLite for fast tests (async via aiosqlite),
with factory helpers for creating test data.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings, get_settings
from app.core.security import create_access_token, hash_password
from app.database import Base, get_async_session
from app.models.category import Category
from app.models.enums import OrderStatusEnum, PaymentModeEnum, RoleEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.user import User

# ── Test database (SQLite async) ─────────────────────────────────────────

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_factory = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create all tables, yield a session, then drop everything."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with test_session_factory() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async test client with DB session override and Redis mock.
    """
    from app.main import app

    # Override DB session
    async def _override_session():
        yield db_session

    app.dependency_overrides[get_async_session] = _override_session

    # Mock Redis for tests
    with patch("app.services.cache_service.get_redis", new_callable=AsyncMock) as mock_redis, \
         patch("app.services.websocket_service.get_redis", new_callable=AsyncMock) as mock_ws_redis:

        # Create a mock Redis that returns None for gets (cache miss)
        redis_mock = AsyncMock()
        redis_mock.get.return_value = None
        redis_mock.set.return_value = True
        redis_mock.delete.return_value = 1
        redis_mock.publish.return_value = 1
        mock_redis.return_value = redis_mock
        mock_ws_redis.return_value = redis_mock

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()


# ── Factory helpers ──────────────────────────────────────────────────────


async def create_test_outlet(
    db: AsyncSession,
    slug: str = "test-outlet",
    name: str = "Test Outlet",
    payment_mode: PaymentModeEnum = PaymentModeEnum.RAZORPAY_GATEWAY,
    razorpay_account_id: str | None = "acc_test123",
    direct_upi_id: str | None = "test@upi",
) -> Outlet:
    outlet = Outlet(
        id=uuid.uuid4(),
        slug=slug,
        name=name,
        payment_mode=payment_mode,
        razorpay_account_id=razorpay_account_id,
        direct_upi_id=direct_upi_id,
    )
    db.add(outlet)
    await db.flush()
    return outlet


create_test_restaurant = create_test_outlet


async def create_test_user(
    db: AsyncSession,
    outlet: Outlet | None = None,
    email: str = "admin@test.com",
    password: str = "testpassword123",
    role: RoleEnum = RoleEnum.OUTLET_ADMIN,
) -> User:
    user = User(
        id=uuid.uuid4(),
        outlet_id=outlet.id if outlet else None,
        role=role,
        email=email,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()
    return user


async def create_test_staff(
    db: AsyncSession,
    outlet: Outlet,
    name: str = "Test Staff",
    email: str = "staff@test.com",
    password: str = "staffpassword123",
    role: RoleEnum = RoleEnum.CASHIER,
) -> User:
    from app.models.user import User

    staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        name=name,
        email=email,
        role=role,
        password_hash=hash_password(password),
        status="active",
    )
    db.add(staff)
    await db.flush()
    return staff


async def create_test_category(
    db: AsyncSession,
    outlet: Outlet,
    name: str = "Fruits",
    display_order: int = 0,
) -> Category:
    category = Category(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        name=name,
        display_order=display_order,
    )
    db.add(category)
    await db.flush()
    return category


async def create_test_menu_item(
    db: AsyncSession,
    outlet: Outlet,
    category: Category,
    name: str = "Fresh Apples",
    price: Decimal = Decimal("9.99"),
    is_available: bool = True,
) -> MenuItem:
    item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        category_id=category.id,
        name=name,
        price=price,
        is_available=is_available,
    )
    db.add(item)
    await db.flush()
    return item


async def create_test_variant(
    db: AsyncSession,
    menu_item: MenuItem,
    name: str = "Large",
    price_delta: Decimal = Decimal("2.00"),
) -> MenuItemVariant:
    variant = MenuItemVariant(
        id=uuid.uuid4(),
        menu_item_id=menu_item.id,
        name=name,
        price_delta=price_delta,
    )
    db.add(variant)
    await db.flush()
    return variant


def get_auth_headers(user: User, outlet: Outlet) -> dict[str, str]:
    """Generate Authorization header with a valid access token."""
    token = create_access_token(
        user_id=user.id,
        outlet_id=outlet.id,
        role=user.role.value,
    )
    return {"Authorization": f"Bearer {token}"}
