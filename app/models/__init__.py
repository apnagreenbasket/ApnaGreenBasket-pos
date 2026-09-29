"""
Models package — import all models here so Alembic and Base.metadata
can discover them for autogenerate.
"""

from app.models.abandoned_cart import AbandonedCart
from app.models.audit_log import AuditLog
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.category import Category
from app.models.customer import Customer
from app.models.customer_ledger import CustomerLedger
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.menu_item_variant import MenuItemVariant
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.outlet import Outlet
from app.models.staff_audit_log import StaffAuditLog
from app.models.staff_punch_session import StaffPunchSession
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.models.purchase_return import PurchaseReturn
from app.models.customer_return import CustomerReturn
from app.models.notification import Notification
from app.models.supplier import Supplier
from app.models.basket_session import BasketSession
from app.models.qr_token import BasketQrToken
from app.models.catalogue_batch import CatalogueBatch
from app.models.sync_action_log import SyncActionLog
from app.models.sync_conflict_flag import SyncConflictFlag
from app.models.local_action_queue import LocalActionQueue
from app.models.user import User
from app.models.webhook_event import WebhookEvent
from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.enums import (
    InventoryUnitEnum,
    OrderStatusEnum,
    PaymentModeEnum,
    PricingModeEnum,
    RoleEnum,
    SessionStatusEnum,
    StockChangeTypeEnum,
    NotificationTypeEnum,
    NotificationChannelEnum,
    VALID_ORDER_TRANSITIONS,
    is_valid_transition,
)

__all__ = [
    "AbandonedCart",
    "AuditLog",
    "BasketQrToken",
    "BasketSession",
    "BillDiscountApproval",
    "CashDrawerLedger",
    "CatalogueBatch",
    "Category",
    "Customer",
    "CustomerLedger",
    "CustomerReturn",
    "InventoryItem",
    "InventoryUnitEnum",
    "LocalActionQueue",
    "MenuItem",
    "MenuItemRecipe",
    "MenuItemVariant",
    "Notification",
    "NotificationTypeEnum",
    "NotificationChannelEnum",
    "Order",
    "OrderItem",
    "OrderStatusEnum",
    "Outlet",
    "PaymentModeEnum",
    "PricingModeEnum",
    "PurchaseReturn",
    "RoleEnum",
    "SessionStatusEnum",
    "StaffAuditLog",
    "StaffPunchSession",
    "StockChangeTypeEnum",
    "StockIntake",
    "StockLedger",
    "Supplier",
    "SyncActionLog",
    "SyncConflictFlag",
    "User",
    "VALID_ORDER_TRANSITIONS",
    "WebhookEvent",
    "is_valid_transition",
]
