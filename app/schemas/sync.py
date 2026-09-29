"""
Sync API schemas — snapshot, action ingestion, status, and conflict management.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


# ── Snapshot ──────────────────────────────────────────────────────────

class MenuItemSnapshot(BaseModel):
    id: uuid.UUID
    name: str
    barcode: str | None = None
    category_id: uuid.UUID
    category_name: str | None = None
    inventory_item_id: uuid.UUID | None = None
    price: Decimal
    mrp: Decimal | None = None
    wholesale_price: Decimal | None = None
    evening_price: Decimal | None = None
    offer_price: Decimal | None = None
    is_on_offer: bool = False
    is_available: bool = True
    pricing_mode: str = "FIXED_UNIT"
    unit_label: str = "piece"
    tax_category: str | None = None
    tax_rate: Decimal | None = None
    image_url: str | None = None
    current_stock: Decimal | None = None
    updated_at: datetime | None = None

class CategorySnapshot(BaseModel):
    id: uuid.UUID
    name: str
    display_order: int | None = None
    updated_at: datetime | None = None

class StaffSnapshot(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    pin_hash: str | None = None  # For offline PIN login — NEVER include password_hash
    status: str = "active"
    updated_at: datetime | None = None

class InventoryItemSnapshot(BaseModel):
    id: uuid.UUID
    name: str
    barcode: str | None = None
    unit: str
    category: str
    current_stock: Decimal
    cost_per_unit: Decimal
    mrp: Decimal | None = None
    tax_category: str | None = None
    tax_rate: Decimal | None = None
    updated_at: datetime | None = None

class StockIntakeSnapshot(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    batch_number: str | None = None
    quantity: Decimal
    remaining_quantity: Decimal
    unit_cost: Decimal
    supplier_name: str | None = None
    expiry_date: datetime | None = None
    intake_date: datetime
    created_at: datetime

class MenuItemVariantSnapshot(BaseModel):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    name: str
    price_delta: Decimal = Decimal("0.00")
    is_available: bool = True

class MenuItemRecipeSnapshot(BaseModel):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    inventory_item_id: uuid.UUID
    quantity_required: Decimal
    unit: str

class CustomerSnapshot(BaseModel):
    id: uuid.UUID
    name: str | None = None
    phone: str
    outlet_id: uuid.UUID
    updated_at: datetime | None = None

class SupplierSnapshot(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None = None
    outlet_id: uuid.UUID
    created_at: datetime | None = None

class OutletConfigSnapshot(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    payment_mode: str
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    direct_upi_id: str | None = None
    raw_upi_payload: str | None = None
    evening_price_active: bool = False
    evening_pricing_mode: str = "OFF"
    near_expiry_threshold_days: int = 7
    verification_amount_cutoff: Decimal | None = None
    logo_url: str | None = None

class SnapshotResponse(BaseModel):
    outlet: OutletConfigSnapshot
    categories: list[CategorySnapshot]
    menu_items: list[MenuItemSnapshot]
    menu_item_variants: list[MenuItemVariantSnapshot] = []
    menu_item_recipes: list[MenuItemRecipeSnapshot] = []
    staff: list[StaffSnapshot]
    inventory_items: list[InventoryItemSnapshot]
    stock_intakes: list[StockIntakeSnapshot]
    customers: list[CustomerSnapshot] = []
    suppliers: list[SupplierSnapshot] = []
    generated_at: datetime
    is_full: bool  # True if full snapshot, False if incremental


# ── Action Ingestion ──────────────────────────────────────────────────

class SyncAction(BaseModel):
    client_action_id: str = Field(..., description="Client-generated unique idempotency key")
    action_type: str = Field(..., description="e.g. bill_created, stock_deducted, payment_confirmed")
    action_timestamp: datetime = Field(..., description="When the action actually happened (client time)")
    payload: dict[str, Any] = Field(default_factory=dict, description="Action-specific data")

class SyncActionsBatchRequest(BaseModel):
    actions: list[SyncAction]

class SyncActionResult(BaseModel):
    client_action_id: str
    status: str  # "applied" | "skipped" | "failed"
    detail: str | None = None
    result: dict[str, Any] | None = None

class SyncActionsBatchResponse(BaseModel):
    results: list[SyncActionResult]


# ── Sync Status ───────────────────────────────────────────────────────

class SyncStatusResponse(BaseModel):
    outlet_id: uuid.UUID
    outlet_name: str
    last_sync_at: datetime | None = None
    pending_conflict_count: int = 0
    server_time: datetime


# ── Conflict Flags ────────────────────────────────────────────────────

class SyncConflictFlagResponse(BaseModel):
    id: uuid.UUID
    outlet_id: uuid.UUID
    action_log_id: uuid.UUID | None = None
    conflict_type: str
    description: str
    details: dict[str, Any] | None = None
    is_resolved: bool = False
    created_at: datetime
