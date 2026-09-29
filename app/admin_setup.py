import os
import logging
from fastapi import Request
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from app import models

logger = logging.getLogger(__name__)

class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        username, password = form.get("username"), form.get("password")
        expected_password = os.environ.get("ADMIN_DASHBOARD_PASSWORD", "admin")
        if username == "admin" and password == expected_password:
            request.session.update({"token": "admin_session_active"})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        token = request.session.get("token")
        if not token:
            return False
        return True

class AbandonedCartAdmin(ModelView, model=models.AbandonedCart):
    column_list = [models.AbandonedCart.id] if hasattr(models.AbandonedCart, "id") else [c.name for c in models.AbandonedCart.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class AuditLogAdmin(ModelView, model=models.AuditLog):
    column_list = [models.AuditLog.id] if hasattr(models.AuditLog, "id") else [c.name for c in models.AuditLog.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class BasketQrTokenAdmin(ModelView, model=models.BasketQrToken):
    column_list = [models.BasketQrToken.id] if hasattr(models.BasketQrToken, "id") else [c.name for c in models.BasketQrToken.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class BasketSessionAdmin(ModelView, model=models.BasketSession):
    column_list = [models.BasketSession.id] if hasattr(models.BasketSession, "id") else [c.name for c in models.BasketSession.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class BillDiscountApprovalAdmin(ModelView, model=models.BillDiscountApproval):
    column_list = [models.BillDiscountApproval.id] if hasattr(models.BillDiscountApproval, "id") else [c.name for c in models.BillDiscountApproval.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class CatalogueBatchAdmin(ModelView, model=models.CatalogueBatch):
    column_list = [models.CatalogueBatch.id] if hasattr(models.CatalogueBatch, "id") else [c.name for c in models.CatalogueBatch.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class CategoryAdmin(ModelView, model=models.Category):
    column_list = [models.Category.id] if hasattr(models.Category, "id") else [c.name for c in models.Category.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class CustomerAdmin(ModelView, model=models.Customer):
    column_list = [models.Customer.id] if hasattr(models.Customer, "id") else [c.name for c in models.Customer.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class CustomerReturnAdmin(ModelView, model=models.CustomerReturn):
    column_list = [models.CustomerReturn.id] if hasattr(models.CustomerReturn, "id") else [c.name for c in models.CustomerReturn.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class InventoryItemAdmin(ModelView, model=models.InventoryItem):
    column_list = [models.InventoryItem.id] if hasattr(models.InventoryItem, "id") else [c.name for c in models.InventoryItem.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class LocalActionQueueAdmin(ModelView, model=models.LocalActionQueue):
    column_list = [models.LocalActionQueue.id] if hasattr(models.LocalActionQueue, "id") else [c.name for c in models.LocalActionQueue.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class MenuItemAdmin(ModelView, model=models.MenuItem):
    column_list = [models.MenuItem.id] if hasattr(models.MenuItem, "id") else [c.name for c in models.MenuItem.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class MenuItemRecipeAdmin(ModelView, model=models.MenuItemRecipe):
    column_list = [models.MenuItemRecipe.id] if hasattr(models.MenuItemRecipe, "id") else [c.name for c in models.MenuItemRecipe.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class MenuItemVariantAdmin(ModelView, model=models.MenuItemVariant):
    column_list = [models.MenuItemVariant.id] if hasattr(models.MenuItemVariant, "id") else [c.name for c in models.MenuItemVariant.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class NotificationAdmin(ModelView, model=models.Notification):
    column_list = [models.Notification.id] if hasattr(models.Notification, "id") else [c.name for c in models.Notification.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class OrderAdmin(ModelView, model=models.Order):
    column_list = [models.Order.id] if hasattr(models.Order, "id") else [c.name for c in models.Order.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class OrderItemAdmin(ModelView, model=models.OrderItem):
    column_list = [models.OrderItem.id] if hasattr(models.OrderItem, "id") else [c.name for c in models.OrderItem.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class OutletAdmin(ModelView, model=models.Outlet):
    column_list = [models.Outlet.id] if hasattr(models.Outlet, "id") else [c.name for c in models.Outlet.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class PurchaseReturnAdmin(ModelView, model=models.PurchaseReturn):
    column_list = [models.PurchaseReturn.id] if hasattr(models.PurchaseReturn, "id") else [c.name for c in models.PurchaseReturn.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class StaffAuditLogAdmin(ModelView, model=models.StaffAuditLog):
    column_list = [models.StaffAuditLog.id] if hasattr(models.StaffAuditLog, "id") else [c.name for c in models.StaffAuditLog.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class StockIntakeAdmin(ModelView, model=models.StockIntake):
    column_list = [models.StockIntake.id] if hasattr(models.StockIntake, "id") else [c.name for c in models.StockIntake.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class StockLedgerAdmin(ModelView, model=models.StockLedger):
    column_list = [models.StockLedger.id] if hasattr(models.StockLedger, "id") else [c.name for c in models.StockLedger.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class SupplierAdmin(ModelView, model=models.Supplier):
    column_list = [models.Supplier.id] if hasattr(models.Supplier, "id") else [c.name for c in models.Supplier.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class SyncActionLogAdmin(ModelView, model=models.SyncActionLog):
    column_list = [models.SyncActionLog.id] if hasattr(models.SyncActionLog, "id") else [c.name for c in models.SyncActionLog.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class SyncConflictFlagAdmin(ModelView, model=models.SyncConflictFlag):
    column_list = [models.SyncConflictFlag.id] if hasattr(models.SyncConflictFlag, "id") else [c.name for c in models.SyncConflictFlag.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class UserAdmin(ModelView, model=models.User):
    column_list = [models.User.id] if hasattr(models.User, "id") else [c.name for c in models.User.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

class WebhookEventAdmin(ModelView, model=models.WebhookEvent):
    column_list = [models.WebhookEvent.id] if hasattr(models.WebhookEvent, "id") else [c.name for c in models.WebhookEvent.__table__.columns]
    can_create = True
    can_edit = True
    can_delete = True
    can_view_details = True
    page_size = 50

def setup_admin(app, engine):
    secret_key = os.environ.get("JWT_SECRET_KEY", "fallback-admin-secret-key-change-me")
    auth_backend = AdminAuth(secret_key=secret_key)
    admin = Admin(app, engine, title="ApnaGreen Basket Admin", authentication_backend=auth_backend)
    admin.add_view(AbandonedCartAdmin)
    admin.add_view(AuditLogAdmin)
    admin.add_view(BasketQrTokenAdmin)
    admin.add_view(BasketSessionAdmin)
    admin.add_view(BillDiscountApprovalAdmin)
    admin.add_view(CatalogueBatchAdmin)
    admin.add_view(CategoryAdmin)
    admin.add_view(CustomerAdmin)
    admin.add_view(CustomerReturnAdmin)
    admin.add_view(InventoryItemAdmin)
    admin.add_view(LocalActionQueueAdmin)
    admin.add_view(MenuItemAdmin)
    admin.add_view(MenuItemRecipeAdmin)
    admin.add_view(MenuItemVariantAdmin)
    admin.add_view(NotificationAdmin)
    admin.add_view(OrderAdmin)
    admin.add_view(OrderItemAdmin)
    admin.add_view(OutletAdmin)
    admin.add_view(PurchaseReturnAdmin)
    admin.add_view(StaffAuditLogAdmin)
    admin.add_view(StockIntakeAdmin)
    admin.add_view(StockLedgerAdmin)
    admin.add_view(SupplierAdmin)
    admin.add_view(SyncActionLogAdmin)
    admin.add_view(SyncConflictFlagAdmin)
    admin.add_view(UserAdmin)
    admin.add_view(WebhookEventAdmin)
