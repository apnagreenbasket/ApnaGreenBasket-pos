import asyncio
from sqlalchemy import select
from app.database import async_session_factory
from app.models.order import Order

async def test():
    async with async_session_factory() as db:
        res = await db.execute(select(Order).order_by(Order.created_at.desc()).limit(5))
        orders = res.scalars().all()
        for o in orders:
            print(f"ID: {str(o.id)[:8]} | Status: {o.status} | Total: {o.total_amount}")

if __name__ == "__main__":
    asyncio.run(test())




