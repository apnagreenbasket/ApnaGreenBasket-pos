import asyncio
import traceback
import logging
from app.core.database import async_session_maker
from app.services.billing_service import process_customer_return
from app.schemas.billing import CustomerReturnRequest, CustomerReturnItemInput
from app.models.order import Order
from sqlalchemy.orm import selectinload
from sqlalchemy import select

logging.basicConfig(level=logging.ERROR)

async def main():
    async with async_session_maker() as db:
        res = await db.execute(select(Order).options(selectinload(Order.items)).where(Order.status == 'COMPLETED').limit(1))
        old_order = res.scalar_one_or_none()
        if old_order:
            return_items = []
            for it in old_order.items:
                return_items.append(CustomerReturnItemInput(
                    order_item_id=str(it.id),
                    quantity=float(it.quantity),
                    unit_price=float(it.unit_price) if it.unit_price is not None else 0.0,
                    reason='TEST'
                ))
            return_req = CustomerReturnRequest(
                order_id=str(old_order.id),
                return_items=return_items,
                refund_payment_method='CASH'
            )
            try:
                await process_customer_return(db, old_order.outlet_id, None, return_req)
                print('SUCCESS')
            except Exception as e:
                print('ERROR:')
                traceback.print_exc()

asyncio.run(main())
