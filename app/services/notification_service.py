"""
Notification Service — Centralized engine for in-app DB alerts, Email, and WhatsApp dispatch.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.enums import NotificationTypeEnum, NotificationChannelEnum
from app.models.notification import Notification
from app.models.outlet import Outlet
from app.models.stock_intake import StockIntake
from app.models.inventory_item import InventoryItem
from app.models.user import User
from app.models.enums import RoleEnum


async def sync_near_expiry_notifications(
    db: AsyncSession, outlet_id: uuid.UUID
) -> None:
    """
    Syncs near-expiry batch notifications into the DB 'notifications' table
    using the outlet's configured near_expiry_threshold_days.
    """
    outlet = await db.get(Outlet, outlet_id)
    if not outlet:
        return

    threshold_days = outlet.near_expiry_threshold_days or 7
    now = datetime.now(timezone.utc)

    # Query active batches expiring within threshold
    stmt = (
        select(StockIntake, InventoryItem)
        .join(InventoryItem, StockIntake.item_id == InventoryItem.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > 0,
            StockIntake.expiry_date.is_not(None),
        )
        .options(joinedload(StockIntake.supplier))
        .order_by(StockIntake.expiry_date.asc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    for intake, item in rows:
        if not intake.expiry_date:
            continue

        exp_date = intake.expiry_date
        if exp_date.tzinfo is None:
            exp_date = exp_date.replace(tzinfo=timezone.utc)

        days_left = (exp_date.date() - now.date()).days

        if days_left <= threshold_days:
            # Expiry status text
            if days_left < 0:
                status_text = "EXPIRED"
                badge_title = f"Batch Expired ({abs(days_left)} days ago)"
            elif days_left == 0:
                status_text = "EXPIRES_TODAY"
                badge_title = "Batch Expires Today!"
            else:
                status_text = "NEAR_EXPIRY"
                badge_title = f"Batch Expiring in {days_left} Days"

            details_payload = {
                "batch_id": str(intake.id),
                "batch_number": intake.batch_number or "N/A",
                "item_id": str(item.id),
                "item_name": item.name,
                "barcode": item.barcode or "N/A",
                "category": item.category or "General",
                "unit": item.unit,
                "remaining_quantity": float(intake.remaining_quantity),
                "initial_quantity": float(intake.initial_quantity) if intake.initial_quantity is not None else float(intake.quantity),
                "cost_per_unit": float(intake.unit_cost or 0),
                "mrp": float(item.mrp) if item.mrp is not None else None,
                "selling_price": float(getattr(item, "selling_price", 0)) if getattr(item, "selling_price", None) is not None else None,
                "supplier_name": intake.supplier.name if intake.supplier else "N/A",
                "expiry_date": intake.expiry_date.isoformat(),
                "days_until_expiry": days_left,
                "status": status_text,
                "threshold_days": threshold_days,
            }

            title = f"{item.name} — {badge_title}"
            message = (
                f"Batch #{intake.batch_number or 'N/A'} has {float(intake.remaining_quantity)} {item.unit} remaining. "
                f"Expiry date: {exp_date.strftime('%d %b %Y')}. Cost/Unit: ₹{float(intake.unit_cost or 0):.2f}"
            )

            # Check if notification already exists for this batch
            existing_stmt = select(Notification).where(
                Notification.outlet_id == outlet_id,
                Notification.type == NotificationTypeEnum.NEAR_EXPIRY,
                Notification.details["batch_id"].as_string() == str(intake.id),
            )
            existing_res = await db.execute(existing_stmt)
            existing_notif = existing_res.scalar_one_or_none()

            if existing_notif:
                existing_notif.title = title
                existing_notif.message = message
                existing_notif.details = details_payload
            else:
                new_notif = Notification(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    type=NotificationTypeEnum.NEAR_EXPIRY,
                    title=title,
                    message=message,
                    details=details_payload,
                    is_read=False,
                    channels_sent=["IN_APP"],
                )
                db.add(new_notif)
                await db.flush()

                # Automatically trigger alert service to configured emails and numbers
                if outlet.notification_emails or outlet.notification_phones:
                    try:
                        from app.services.alert_dispatch_service import dispatch_outlet_alert
                        alert_res = await dispatch_outlet_alert(
                            outlet=outlet,
                            title=title,
                            message=message,
                            details=details_payload,
                        )
                        new_notif.channels_sent = list(set(new_notif.channels_sent or []).union(alert_res.get("dispatched_channels", [])))
                    except Exception as e:
                        print(f"⚠️ [Near Expiry Alert Dispatch Warning] {e}")

    await db.commit()


async def sync_shelf_life_notifications(db: AsyncSession, outlet_id: uuid.UUID) -> None:
    """
    Syncs shelf life alerts into the DB 'notifications' table.
    Checks if intake_date + shelf_life_alert_hrs <= NOW() for active batches.
    """
    outlet = await db.get(Outlet, outlet_id)
    now = datetime.now(timezone.utc)
    
    stmt = (
        select(StockIntake, InventoryItem)
        .join(InventoryItem, StockIntake.item_id == InventoryItem.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.remaining_quantity > 0,
            InventoryItem.shelf_life_alert_hrs.is_not(None)
        )
    )
    res = await db.execute(stmt)
    rows = res.all()

    for intake, item in rows:
        alert_hrs = item.shelf_life_alert_hrs
        intake_date = intake.intake_date
        
        if intake_date.tzinfo is None:
            intake_date = intake_date.replace(tzinfo=timezone.utc)
            
        elapsed_hours = (now - intake_date).total_seconds() / 3600
        
        if elapsed_hours >= alert_hrs:
            details_payload = {
                "batch_id": str(intake.id),
                "batch_number": intake.batch_number or "N/A",
                "item_id": str(item.id),
                "item_name": item.name,
                "unit": item.unit,
                "remaining_quantity": float(intake.remaining_quantity),
                "cost_per_unit": float(intake.unit_cost or 0),
                "shelf_life_alert_hrs": alert_hrs,
            }
            
            threshold_label = f"{alert_hrs // 24}d ({alert_hrs}h)" if alert_hrs >= 24 and alert_hrs % 24 == 0 else f"{alert_hrs}h"
            title = f"{item.name} — Shelf Life Reached"
            message = f"The item shelf life has reached ({threshold_label} threshold) and its current count is {float(intake.remaining_quantity)} {item.unit}."
            
            existing_stmt = select(Notification).where(
                Notification.outlet_id == outlet_id,
                Notification.type == NotificationTypeEnum.SHELF_LIFE_ALERT,
                Notification.details["batch_id"].as_string() == str(intake.id),
            )
            existing_res = await db.execute(existing_stmt)
            existing_notif = existing_res.scalar_one_or_none()

            if existing_notif:
                existing_notif.title = title
                existing_notif.message = message
                existing_notif.details = details_payload
            else:
                new_notif = Notification(
                    id=uuid.uuid4(),
                    outlet_id=outlet_id,
                    type=NotificationTypeEnum.SHELF_LIFE_ALERT,
                    title=title,
                    message=message,
                    details=details_payload,
                    is_read=False,
                    channels_sent=["IN_APP"],
                )
                db.add(new_notif)
                await db.flush()

                # Automatically trigger alert service to configured emails and numbers
                if outlet and (outlet.notification_emails or outlet.notification_phones):
                    try:
                        from app.services.alert_dispatch_service import dispatch_outlet_alert
                        alert_res = await dispatch_outlet_alert(
                            outlet=outlet,
                            title=title,
                            message=message,
                            details=details_payload,
                        )
                        new_notif.channels_sent = list(set(new_notif.channels_sent or []).union(alert_res.get("dispatched_channels", [])))
                    except Exception as e:
                        print(f"⚠️ [Shelf Life Alert Dispatch Warning] {e}")

    await db.commit()


async def get_outlet_notifications(
    db: AsyncSession, outlet_id: uuid.UUID, unread_only: bool = False
) -> dict[str, Any]:
    """
    Returns stored notifications for an outlet along with live unread badge count.
    """
    await sync_near_expiry_notifications(db, outlet_id)
    await sync_shelf_life_notifications(db, outlet_id)

    outlet = await db.get(Outlet, outlet_id)
    threshold_days = outlet.near_expiry_threshold_days if outlet else 7

    stmt = select(Notification).where(Notification.outlet_id == outlet_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read == False)

    stmt = stmt.order_by(Notification.created_at.desc())
    res = await db.execute(stmt)
    notifications = list(res.scalars().all())

    # Count unread
    unread_stmt = select(func.count(Notification.id)).where(
        Notification.outlet_id == outlet_id, Notification.is_read == False
    )
    unread_res = await db.execute(unread_stmt)
    unread_count = unread_res.scalar() or 0

    return {
        "notifications": notifications,
        "unread_count": unread_count,
        "threshold_days": threshold_days,
    }


async def mark_notification_as_read(
    db: AsyncSession, notification_id: uuid.UUID, outlet_id: uuid.UUID
) -> Notification | None:
    """Marks a notification as read."""
    stmt = select(Notification).where(
        Notification.id == notification_id, Notification.outlet_id == outlet_id
    )
    res = await db.execute(stmt)
    notif = res.scalar_one_or_none()
    if notif:
        notif.is_read = True
        await db.commit()
        await db.refresh(notif)
    return notif


async def dispatch_notification_channels(
    db: AsyncSession, notification_id: uuid.UUID, outlet_id: uuid.UUID
) -> dict[str, Any]:
    """
    Dispatches formatted Email and WhatsApp alerts for a notification.
    """
    stmt = select(Notification).where(
        Notification.id == notification_id, Notification.outlet_id == outlet_id
    )
    res = await db.execute(stmt)
    notif = res.scalar_one_or_none()
    if not notif:
        raise ValueError("Notification not found")

    outlet = await db.get(Outlet, outlet_id)
    if not outlet:
        raise ValueError("Outlet not found")

    # Resolve recipient emails and phones
    recipient_emails = list(outlet.notification_emails or [])
    recipient_phones = list(outlet.notification_phones or [])
    
    if not recipient_emails:
        user_stmt = select(User).where(
            User.outlet_id == outlet_id, User.role == RoleEnum.OUTLET_ADMIN
        )
        user_res = await db.execute(user_stmt)
        admin_user = user_res.scalar_one_or_none()
        if admin_user and admin_user.email:
            recipient_emails = [admin_user.email]
            outlet.notification_emails = [admin_user.email]

    # Multi-channel Alert Dispatch (Resend Email, WhatsApp, SMS)
    from app.services.alert_dispatch_service import dispatch_outlet_alert
    dispatch_res = await dispatch_outlet_alert(
        outlet=outlet,
        title=notif.title,
        message=notif.message,
        details=notif.details,
    )
    dispatched_channels = dispatch_res.get("dispatched_channels", ["IN_APP"])

    notif.channels_sent = list(set(notif.channels_sent or []).union(dispatched_channels))
    await db.commit()

    return {
        "notification_id": notif.id,
        "dispatched_channels": dispatched_channels,
        "recipient_emails": recipient_emails,
        "recipient_phones": recipient_phones,
        "status": "SUCCESS",
    }


async def sync_all_outlets_notifications(db_session_factory) -> None:
    """
    Background sweep function that iterates over all outlets in the system
    and syncs near-expiry batch notifications into the database.
    """
    async with db_session_factory() as db:
        res = await db.execute(select(Outlet.id))
        outlet_ids = res.scalars().all()
        for outlet_id in outlet_ids:
            try:
                await sync_near_expiry_notifications(db, outlet_id)
                await sync_shelf_life_notifications(db, outlet_id)
            except Exception as err:
                print(f"⚠️ [Notification Sweep Warning] Outlet {outlet_id}: {err}")


async def run_notification_scheduler(
    db_session_factory, interval_seconds: int = 300
) -> None:
    """
    Background async loop that periodically runs notification sweeps
    across all outlets (default: every 5 minutes).
    """
    import asyncio
    print("🔔 [Scheduler] Started background notification sweep worker.")
    while True:
        try:
            await sync_all_outlets_notifications(db_session_factory)
        except asyncio.CancelledError:
            break
        except Exception as err:
            print(f"⚠️ [Notification Scheduler Exception] {err}")
        await asyncio.sleep(interval_seconds)

