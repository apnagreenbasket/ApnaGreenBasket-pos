"""
Database seed script — populates initial restaurant, users, categories, menu items, and variants.
Works with both SQLite (zero-dependency) and PostgreSQL.

Usage:
    python seed.py
"""

import asyncio
import uuid
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.database import Base, async_session_factory, engine
from app.models.category import Category
from app.models.enums import PaymentModeEnum, PricingModeEnum, RoleEnum
from app.models.menu_item import MenuItem
from app.models.menu_item_variant import MenuItemVariant
from app.models.outlet import Outlet
from app.models.user import User


async def seed_data():
    print("[Seed] Initializing database tables...")
    # Create all tables if they don't exist yet (for SQLite / local dev)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as db:
        # Check if outlet already exists
        existing = await db.execute(
            select(Outlet).where(Outlet.slug == "apnagreenbasket-jammu")
        )
        if existing.scalar_one_or_none():
            print("[Seed] Outlet 'apnagreenbasket-jammu' already exists. Skipping seed.")
            return

        # 1. Create Outlet
        outlet = Outlet(
            id=uuid.uuid4(),
            slug="apnagreenbasket-jammu",
            name="ApnaGreen Basket Jammu",
            payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
            razorpay_account_id="acc_demo123",
            address="Gandhi Nagar, Jammu, J&K 180004",
            phone="+91 9876543210",
        )
        db.add(outlet)
        await db.flush()

        # 2. Create Admin User
        admin_user = User(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            role=RoleEnum.OUTLET_ADMIN,
            email="admin@apnagreenbasket.com",
            password_hash=hash_password("admin123456"),
        )
        db.add(admin_user)

        # 2b. Create Superadmin User
        superadmin_user = User(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            role=RoleEnum.SUPERADMIN,
            email="superadmin@apnagreenbasket.com",
            password_hash=hash_password("admin123456"),
        )
        db.add(superadmin_user)

        # 3. Create Categories & Produce/Grocery Items
        cat1 = Category(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            name="Fresh Farm Produce",
            display_order=1,
        )
        cat2 = Category(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            name="Dairy & Staples",
            display_order=2,
        )
        cat3 = Category(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            name="Organic Beverages",
            display_order=3,
        )
        db.add_all([cat1, cat2, cat3])
        await db.flush()

        # Item 1: Organic Jammu Tomatoes
        item1 = MenuItem(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            category_id=cat1.id,
            name="Organic Jammu Tomatoes",
            description="Freshly harvested vine-ripened red organic tomatoes sourced directly from local Jammu farms.",
            price=Decimal("40.00"),
            pricing_mode=PricingModeEnum.WEIGHT_BASED,
            unit_label="kg",
            image_url="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Item 2: Fresh Pumpkin
        item2 = MenuItem(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            category_id=cat1.id,
            name="Local Sweet Pumpkin",
            description="Single whole farm-fresh sweet pumpkin sold on variable weight basis.",
            price=Decimal("35.00"),
            pricing_mode=PricingModeEnum.WEIGHT_BASED,
            unit_label="kg",
            image_url="https://images.unsplash.com/photo-1570586437263-ab629fccc818?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Item 3: Jammu Rajma
        item3 = MenuItem(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            category_id=cat2.id,
            name="Bhaderwah Rajma Special",
            description="Premium grade authentic red kidney beans sourced from Bhaderwah Jammu hills.",
            price=Decimal("160.00"),
            pricing_mode=PricingModeEnum.WEIGHT_BASED,
            unit_label="kg",
            image_url="https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Item 4: Farm Milk
        item4 = MenuItem(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            category_id=cat2.id,
            name="Farm Fresh Whole Milk",
            description="Full cream pure cow milk, chilled 1 Litre pouch.",
            price=Decimal("60.00"),
            pricing_mode=PricingModeEnum.FIXED_UNIT,
            unit_label="1L",
            image_url="https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        # Item 5: Organic Hibiscus Drink
        item5 = MenuItem(
            id=uuid.uuid4(),
            outlet_id=outlet.id,
            category_id=cat3.id,
            name="Cold Pressed Hibiscus Sparkler",
            description="Cold-brewed organic hibiscus extract, fresh citrus yuzu, and mint water.",
            price=Decimal("120.00"),
            pricing_mode=PricingModeEnum.FIXED_UNIT,
            unit_label="bottle",
            image_url="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
            is_available=True,
        )
        db.add_all([item1, item2, item3, item4, item5])
        await db.flush()

        # Variants
        v1a = MenuItemVariant(
            id=uuid.uuid4(),
            menu_item_id=item1.id,
            name="500g Pack",
            price_delta=Decimal("0.00"),
        )
        v1b = MenuItemVariant(
            id=uuid.uuid4(),
            menu_item_id=item1.id,
            name="1kg Pack",
            price_delta=Decimal("20.00"),
        )
        db.add_all([v1a, v1b])

        await db.commit()
        print("[Seed] Seeding complete!")
        print("       Outlet Slug: apnagreenbasket-jammu")
        print("       Admin Login: admin@apnagreenbasket.com / admin123456")


if __name__ == "__main__":
    asyncio.run(seed_data())
