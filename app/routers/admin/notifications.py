"""
Notifications router — Manage in-app notifications and multi-channel Email/WhatsApp alerts.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import DBSession, RequireAdmin
from app.schemas.notification import (
    NotificationListResponse,
    NotificationResponse,
    NotificationDispatchResponse,
)
from app.services.notification_service import (
    get_outlet_notifications,
    mark_notification_as_read,
    dispatch_notification_channels,
)

router = APIRouter(prefix="/api/admin/notifications", tags=["admin-notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    current_user: RequireAdmin,
    db: DBSession,
    unread_only: bool = Query(default=False),
):
    """
    Get in-app notifications and unread badge count for the current user's outlet.
    """
    if not current_user.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to an outlet.",
        )

    data = await get_outlet_notifications(
        db=db, outlet_id=current_user.outlet_id, unread_only=unread_only
    )
    return NotificationListResponse(**data)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Mark a notification as read.
    """
    if not current_user.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to an outlet.",
        )

    notif = await mark_notification_as_read(
        db=db, notification_id=notification_id, outlet_id=current_user.outlet_id
    )
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    return notif


@router.post("/{notification_id}/dispatch", response_model=NotificationDispatchResponse)
async def dispatch_notification(
    notification_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """
    Manually or automatically dispatch Email & WhatsApp alerts for a notification.
    """
    if not current_user.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to an outlet.",
        )

    try:
        data = await dispatch_notification_channels(
            db=db, notification_id=notification_id, outlet_id=current_user.outlet_id
        )
        return NotificationDispatchResponse(**data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
