"""
Menu schemas — MenuItem (Product), MenuItemVariant, and public menu tree.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from datetime import datetime, timezone
from decimal import Decimal

from pydantic import Field, computed_field, field_validator, model_validator

from app.models.enums import PricingModeEnum
from app.schemas.common import BaseResponse, StrictSchema
from app.schemas.inventory import ItemBatchSummary


# ── MenuItem (Product) ───────────────────────────────────────────────────


class MenuItemCreate(StrictSchema):
    category_id: uuid.UUID
    inventory_item_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    barcode: str | None = Field(None, max_length=100)
    description: str | None = None
    price: Decimal = Field(ge=0, decimal_places=2)
    image_url: str | None = None
    is_available: bool = True
    is_on_offer: bool = False
    is_verification_required: bool = False
    offer_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    offer_label: str | None = None
    offer_expires_at: datetime | None = None
    mrp: Decimal | None = Field(None, ge=0, decimal_places=2)
    wholesale_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    evening_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    tax_category: str | None = Field(default="GST 0%", max_length=100)
    tax_rate: Decimal | None = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    hsn_code: str | None = Field(None, max_length=20)
    pricing_mode: PricingModeEnum = PricingModeEnum.FIXED_UNIT
    unit_label: str = Field(default="piece", min_length=1, max_length=50)
    alternate_units: list[dict] = Field(default_factory=list)
    allow_oversell: bool = True

    @field_validator("offer_price", "mrp", "wholesale_price", "evening_price", mode="before")
    @classmethod
    def empty_offer_price_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

    @field_validator("barcode", "description", "image_url", "offer_label", "tax_category", "hsn_code", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v


class MenuItemUpdate(StrictSchema):
    category_id: uuid.UUID | None = None
    inventory_item_id: uuid.UUID | None = None
    name: str | None = Field(None, min_length=1, max_length=255)
    barcode: str | None = Field(None, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0, decimal_places=2)
    image_url: str | None = None
    is_available: bool | None = None
    is_on_offer: bool | None = None
    is_verification_required: bool | None = None
    offer_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    offer_label: str | None = None
    offer_expires_at: datetime | None = None
    mrp: Decimal | None = Field(None, ge=0, decimal_places=2)
    wholesale_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    evening_price: Decimal | None = Field(None, ge=0, decimal_places=2)
    tax_category: str | None = Field(None, max_length=100)
    tax_rate: Decimal | None = Field(None, ge=0, decimal_places=2)
    hsn_code: str | None = Field(None, max_length=20)
    pricing_mode: PricingModeEnum | None = None
    unit_label: str | None = Field(None, min_length=1, max_length=50)
    alternate_units: list[dict] | None = None
    allow_oversell: bool | None = None

    @field_validator("offer_price", "mrp", "wholesale_price", "evening_price", mode="before")
    @classmethod
    def empty_offer_price_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

    @field_validator("barcode", "description", "image_url", "offer_label", "tax_category", "hsn_code", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v


class MenuItemResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    category_id: uuid.UUID
    inventory_item_id: uuid.UUID | None = None
    name: str
    barcode: str | None = None
    description: str | None
    price: Decimal
    image_url: str | None
    is_available: bool
    is_on_offer: bool = False
    is_verification_required: bool = False
    offer_price: Decimal | None = None
    offer_label: str | None = None
    offer_expires_at: datetime | None = None
    mrp: Decimal | None = None
    wholesale_price: Decimal | None = None
    evening_price: Decimal | None = None
    tax_category: str | None = "GST 0%"
    tax_rate: Decimal | None = Decimal("0.00")
    hsn_code: str | None = None
    pricing_mode: PricingModeEnum = PricingModeEnum.FIXED_UNIT
    unit_label: str = "piece"
    alternate_units: list[dict] = Field(default_factory=list)
    total_sold: int = 0
    variants: list[VariantResponse] = Field(default_factory=list)
    active_batches: list[ItemBatchSummary] = Field(default_factory=list)
    current_stock: Decimal | None = None
    allow_oversell: bool = True
    is_out_of_stock: bool = False
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def mask_expired_offer(self) -> MenuItemResponse:
        if self.is_on_offer and self.offer_expires_at is not None:
            if datetime.now(timezone.utc) >= self.offer_expires_at:
                self.is_on_offer = False
                self.offer_price = None
                self.offer_label = None
        return self


class MenuItemPageResponse(BaseResponse):
    items: list[MenuItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── MenuItemVariant ──────────────────────────────────────────────────────


class VariantCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    price_delta: Decimal = Field(default=Decimal("0.00"), decimal_places=2)
    is_available: bool = True


class VariantUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    price_delta: Decimal | None = Field(None, decimal_places=2)
    is_available: bool | None = None


class VariantResponse(BaseResponse):
    id: uuid.UUID
    menu_item_id: uuid.UUID
    name: str
    price_delta: Decimal
    is_available: bool


# ── Public menu tree (nested JSON) ──────────────────────────────────────


class PublicVariant(BaseResponse):
    id: uuid.UUID
    name: str
    price_delta: Decimal
    is_available: bool


class PublicMenuItem(BaseResponse):
    id: uuid.UUID
    name: str
    barcode: str | None = None
    description: str | None
    price: Decimal
    mrp: Decimal | None = None
    evening_price: Decimal | None = None
    image_url: str | None
    is_available: bool
    is_on_offer: bool = False
    is_verification_required: bool = False
    offer_price: Decimal | None = None
    offer_label: str | None = None
    offer_expires_at: datetime | None = None
    pricing_mode: PricingModeEnum = PricingModeEnum.FIXED_UNIT
    unit_label: str = "piece"
    alternate_units: list[dict] = Field(default_factory=list)
    variants: list[PublicVariant] = []

    @model_validator(mode="after")
    def mask_expired_offer(self) -> PublicMenuItem:
        if self.is_on_offer and self.offer_expires_at is not None:
            if datetime.now(timezone.utc) >= self.offer_expires_at:
                self.is_on_offer = False
                self.offer_price = None
                self.offer_label = None
        return self


class PublicCategory(BaseResponse):
    id: uuid.UUID
    name: str
    display_order: int
    items: list[PublicMenuItem] = []


class PublicMenuResponse(BaseResponse):
    outlet_name: str
    outlet_slug: str
    categories: list[PublicCategory] = []
