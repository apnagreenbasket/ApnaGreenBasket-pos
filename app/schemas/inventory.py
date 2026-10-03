"""
Inventory schemas — CRUD requests/responses for inventory master, intakes, recipes, batches, and ledger.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from typing import Any, Dict, List, Optional

from pydantic import Field, computed_field, field_validator

from app.models.enums import StockChangeTypeEnum, MarginTypeEnum
from app.schemas.common import BaseResponse, StrictSchema


class InventoryItemCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    barcode: str | None = Field(None, max_length=100)
    unit: str
    category: str = Field(default="General", max_length=100)
    current_stock: Decimal = Field(default=Decimal("0.000"), ge=0)
    reorder_threshold: Decimal = Field(default=Decimal("0.000"), ge=0)
    cost_per_unit: Decimal = Field(default=Decimal("0.00"), ge=0)
    mrp: Decimal | None = Field(None, ge=0)
    wholesale_price: Decimal | None = Field(None, ge=0)
    retail_price: Decimal | None = Field(None, ge=0)
    margin_type: MarginTypeEnum = Field(default=MarginTypeEnum.MARKUP)
    retail_margin_pct: Decimal | None = Field(None, ge=0)
    mrp_margin_pct: Decimal | None = Field(None, ge=0)
    wholesale_margin_pct: Decimal | None = Field(None, ge=0)
    tax_category: str | None = Field(default="GST 0%", max_length=100)
    tax_rate: Decimal | None = Field(default=Decimal("0.00"), ge=0)
    hsn_code: str | None = Field(None, max_length=20)
    shelf_life_alert_hrs: int | None = Field(None, ge=1)
    alternate_units: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    allow_oversell: bool = True


class InventoryItemUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    barcode: str | None = Field(None, max_length=100)
    unit: str | None = None
    category: str | None = Field(None, max_length=100)
    current_stock: Decimal | None = None
    reorder_threshold: Decimal | None = Field(None, ge=0)
    cost_per_unit: Decimal | None = Field(None, ge=0)
    mrp: Decimal | None = Field(None, ge=0)
    wholesale_price: Decimal | None = Field(None, ge=0)
    retail_price: Decimal | None = Field(None, ge=0)
    margin_type: MarginTypeEnum | None = None
    retail_margin_pct: Decimal | None = Field(None, ge=0)
    mrp_margin_pct: Decimal | None = Field(None, ge=0)
    wholesale_margin_pct: Decimal | None = Field(None, ge=0)
    tax_category: str | None = Field(None, max_length=100)
    tax_rate: Decimal | None = Field(None, ge=0)
    hsn_code: str | None = Field(None, max_length=20)
    is_active: bool | None = None
    shelf_life_alert_hrs: int | None = Field(None, ge=1)
    alternate_units: Optional[List[Dict[str, Any]]] = None
    allow_oversell: bool | None = None


class InventoryItemResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    barcode: str | None = None
    unit: str
    alternate_units: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    category: str
    current_stock: Decimal
    reorder_threshold: Decimal
    cost_per_unit: Decimal
    mrp: Decimal | None = None
    wholesale_price: Decimal | None = None
    retail_price: Decimal | None = None
    margin_type: MarginTypeEnum
    retail_margin_pct: Decimal | None = None
    mrp_margin_pct: Decimal | None = None
    wholesale_margin_pct: Decimal | None = None
    tax_category: str | None = "GST 0%"
    tax_rate: Decimal | None = Decimal("0.00")
    hsn_code: str | None = None
    is_active: bool
    shelf_life_alert_hrs: int | None = None
    allow_oversell: bool = True
    latest_batch_date: datetime | None = None
    created_at: datetime
    updated_at: datetime


class StockIntakeCreate(StrictSchema):
    item_id: uuid.UUID
    batch_number: str | None = Field(None, max_length=100)
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)
    retail_price: Decimal | None = Field(None, ge=0)
    mrp: Decimal | None = Field(None, ge=0)
    wholesale_price: Decimal | None = Field(None, ge=0)
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None = None
    intake_date: datetime = Field(default_factory=datetime.utcnow)
    expiry_date: datetime | None = None
    notes: str | None = None
    margin_type: MarginTypeEnum | None = None
    retail_margin_pct: Decimal | None = Field(None, ge=0)
    mrp_margin_pct: Decimal | None = Field(None, ge=0)
    wholesale_margin_pct: Decimal | None = Field(None, ge=0)


class StockIntakeResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    item_id: uuid.UUID
    batch_number: str | None = None
    quantity: Decimal
    remaining_quantity: Decimal = Decimal("0.000")
    unit_cost: Decimal
    retail_price: Decimal | None = None
    mrp: Decimal | None = None
    wholesale_price: Decimal | None = None
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None = None
    intake_date: datetime
    expiry_date: datetime | None = None
    added_by: uuid.UUID | None
    notes: str | None
    created_at: datetime


# ── Barcode Scanner Requests & Responses ────────────────────────────────


class ScanIncrementRequest(StrictSchema):
    barcode: str = Field(min_length=1, max_length=100)
    quantity: Decimal = Field(default=Decimal("1.000"), gt=0)
    batch_number: str | None = Field(None, max_length=100)
    expiry_date: datetime | None = None
    unit_cost: Decimal | None = Field(None, ge=0)


class ScanOnboardRequest(StrictSchema):
    item_id: uuid.UUID | None = None
    barcode: str | None = Field(None, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(default="General", max_length=100)
    unit: str = 'piece'
    initial_stock: Decimal = Field(default=Decimal("0.000"), ge=0)
    sorted_quantity: Decimal | None = Field(None, ge=0)
    total_billed_amount: Decimal | None = Field(None, ge=0)
    cost_per_unit: Decimal = Field(default=Decimal("0.00"), ge=0)
    selling_price: Decimal | None = Field(None, ge=0)
    mrp: Decimal | None = Field(None, ge=0)
    wholesale_price: Decimal | None = Field(None, ge=0)
    margin_type: MarginTypeEnum = Field(default=MarginTypeEnum.MARKUP)
    retail_margin_pct: Decimal | None = Field(None, ge=0)
    mrp_margin_pct: Decimal | None = Field(None, ge=0)
    wholesale_margin_pct: Decimal | None = Field(None, ge=0)
    tax_category: str | None = Field(default="GST 0%", max_length=100)
    tax_rate: Decimal | None = Field(default=Decimal("0.00"), ge=0)
    hsn_code: str | None = Field(None, max_length=20)
    reorder_threshold: Decimal = Field(default=Decimal("5.000"), ge=0)
    batch_number: str | None = Field(None, max_length=100)
    expiry_date: datetime | None = None
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None = None
    shelf_life_alert_hrs: int | None = Field(None, ge=1)
    alternate_units: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

    @field_validator("barcode", "tax_category", "hsn_code", mode="before")
    @classmethod
    def clean_empty_barcode(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return None
        return v


class SupplierCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    address: str | None = Field(None, max_length=1000)
    gstin: str | None = Field(None, max_length=50)
    contact_person: str | None = Field(None, max_length=100)
    payment_terms: str | None = Field(None, max_length=100)
    notes: str | None = Field(None)


class SupplierUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=50)
    email: str | None = Field(None, max_length=255)
    address: str | None = Field(None, max_length=1000)
    gstin: str | None = Field(None, max_length=50)
    contact_person: str | None = Field(None, max_length=100)
    payment_terms: str | None = Field(None, max_length=100)
    notes: str | None = Field(None)
    is_active: bool | None = Field(None)


class SupplierResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    gstin: str | None = None
    contact_person: str | None = None
    payment_terms: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime


class ScanLookupResponse(BaseResponse):
    found: bool
    barcode: str
    item: InventoryItemResponse | None = None


class BatchDetailResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    item_barcode: str | None = None
    unit: str
    batch_number: str
    quantity: Decimal
    initial_quantity: Decimal | None = None
    remaining_quantity: Decimal
    unit_cost: Decimal
    purchase_unit_cost: Decimal | None = None
    supplier_id: uuid.UUID | None = None
    supplier_name: str | None = None
    intake_date: datetime
    expiry_date: datetime | None = None
    shelf_life_alert_hrs: int | None = None
    status: str  # "ACTIVE", "EXPIRING_SOON", "EXPIRED", "DEPLETED", "OVERSOLD", "VOIDED"
    is_void: bool = False
    notes: str | None = None
    retail_price: Decimal | None = None
    mrp: Decimal | None = None
    wholesale_price: Decimal | None = None
    item_cost_per_unit: Decimal | None = None
    item_retail_price: Decimal | None = None
    item_mrp: Decimal | None = None
    margin_type: MarginTypeEnum | None = None
    retail_margin_pct: Decimal | None = None
    mrp_margin_pct: Decimal | None = None


class ItemBatchSummary(StrictSchema):
    id: uuid.UUID
    batch_number: str
    remaining_quantity: Decimal
    unit_cost: Decimal
    retail_price: Decimal | None = None
    mrp: Decimal | None = None
    wholesale_price: Decimal | None = None
    expiry_date: datetime | None = None
    intake_date: datetime | None = None
    is_oldest: bool = False


class BatchUpdateMetadataRequest(StrictSchema):
    batch_number: str | None = Field(None, min_length=1, max_length=100)
    expiry_date: datetime | None = None
    intake_date: datetime | None = None
    supplier_id: uuid.UUID | None = None
    notes: str | None = Field(None, max_length=500)
    shelf_life_alert_hrs: int | None = Field(None, ge=1)
    mrp: Decimal | None = None
    retail_price: Decimal | None = None
    wholesale_price: Decimal | None = None
    alternate_units: list[dict[str, Any]] | None = None
    sync_catalog_price: bool = False


# ── Recipes & Stock Ledger ───────────────────────────────────────────────


class RecipeIngredientItem(StrictSchema):
    inventory_item_id: uuid.UUID
    quantity_required: Decimal = Field(gt=0)
    unit: str


class RecipeSaveRequest(StrictSchema):
    menu_item_id: uuid.UUID
    ingredients: list[RecipeIngredientItem] = Field(default_factory=list)


class RecipeIngredientResponse(BaseResponse):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    inventory_item_id: uuid.UUID
    inventory_item_name: str | None = None
    quantity_required: Decimal
    unit: str


class StockLedgerResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str | None = None
    unit: str | None = None
    change_type: StockChangeTypeEnum
    quantity_change: Decimal
    resulting_stock: Decimal
    batch_balance: Decimal | None = None
    batch_number: str | None = None
    reference_order_id: uuid.UUID | None
    intake_id: uuid.UUID | None = None
    unit_cost_snapshot: Decimal | None = None
    created_by: uuid.UUID | None
    created_at: datetime
    reason: str | None = None
    notes: str | None = None


class StockLedgerPageResponse(BaseResponse):
    items: list[StockLedgerResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class BatchExpiryAlertResponse(BaseResponse):
    intake_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    unit: str
    remaining_quantity: Decimal
    expiry_date: datetime
    days_until_expiry: int
    status: str  # "EXPIRED" or "EXPIRING_SOON"


class StockWastageRequest(StrictSchema):
    item_id: uuid.UUID
    quantity: Decimal = Field(gt=0, description="Quantity to write off as wastage")
    reason: str = Field(min_length=1, max_length=100, description="Reason: SPOILED_EXPIRED, DAMAGED_TRANSIT, AUDIT_CORRECTION, THEFT_LOST, OTHER")
    notes: str | None = Field(None, max_length=500)
    batch_number: str | None = Field(None, max_length=100)


class StockWastageResponse(BaseResponse):
    success: bool
    message: str
    item_id: uuid.UUID
    item_name: str
    quantity_wasted: Decimal
    new_current_stock: Decimal
    estimated_loss_amount: Decimal
    ledger_entry_id: uuid.UUID


InventoryItemCreate.model_rebuild()
InventoryItemUpdate.model_rebuild()
InventoryItemResponse.model_rebuild()
StockIntakeCreate.model_rebuild()
StockIntakeResponse.model_rebuild()
ScanIncrementRequest.model_rebuild()
ScanOnboardRequest.model_rebuild()
ScanLookupResponse.model_rebuild()
BatchDetailResponse.model_rebuild()
BatchUpdateMetadataRequest.model_rebuild()
RecipeIngredientItem.model_rebuild()
RecipeSaveRequest.model_rebuild()
RecipeIngredientResponse.model_rebuild()
StockLedgerResponse.model_rebuild()
StockLedgerPageResponse.model_rebuild()
BatchExpiryAlertResponse.model_rebuild()
StockWastageRequest.model_rebuild()
StockWastageResponse.model_rebuild()
SupplierCreate.model_rebuild()
SupplierUpdate.model_rebuild()
SupplierResponse.model_rebuild()

from pydantic import BaseModel

class InventoryPageResponse(BaseModel):
    items: list[InventoryItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

class BatchPageResponse(BaseModel):
    items: list[BatchDetailResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
