"""
Purchase Return & Batch Adjustment Pydantic Schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class BatchAdjustmentRequest(BaseModel):
    adjustment_type: str = Field(..., description="PURCHASE_RETURN, MANUAL_ADJUSTMENT, VOID_BATCH, or INTAKE_CORRECTION")
    quantity: Decimal = Field(default=Decimal("0.0"), description="Quantity to reduce, return, or delta/total")
    reason: str = Field(default="OTHER", description="Reason for return or adjustment")
    supplier_name: str | None = Field(default=None, description="Supplier name for return bill")
    return_rate: Decimal | None = Field(default=None, description="Custom unit cost rate for return bill")
    notes: str | None = Field(default=None, description="Optional staff notes")
    # Inward & Cost Correction fields
    new_total_quantity: Decimal | None = Field(default=None, description="New total inward quantity (if setting absolute total)")
    quantity_delta: Decimal | None = Field(default=None, description="Stock delta to apply (+ to append, - to reduce)")
    total_billed: Decimal | None = Field(default=None, description="Updated total invoice amount (recomputes unit_cost)")
    new_unit_cost: Decimal | None = Field(default=None, description="Directly override batch unit cost")
    new_retail_price: Decimal | None = Field(default=None, description="Directly override batch retail price")
    new_mrp: Decimal | None = Field(default=None, description="Directly override batch MRP")
    new_wholesale_price: Decimal | None = Field(default=None, description="Directly override batch wholesale price")
    sync_catalog_price: bool = Field(default=True, description="Sync new cost & recalculate retail price/mrp on item & menu item")



class PurchaseReturnResponse(BaseModel):
    id: uuid.UUID
    return_number: str
    outlet_id: uuid.UUID
    intake_id: uuid.UUID | None
    item_id: uuid.UUID
    item_name: str | None = None
    supplier_name: str
    batch_number: str | None
    quantity: Decimal
    unit_cost: Decimal
    total_refund_amount: Decimal
    reason: str
    notes: str | None
    created_by: uuid.UUID | None
    created_by_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
