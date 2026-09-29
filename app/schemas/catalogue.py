"""
Catalogue schemas — CRUD request/response for catalogue print batches.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseResponse, StrictSchema


class CatalogueItemSchema(StrictSchema):
    id: str
    name_en: str
    name_hi: str | None = None
    image_url: str = ""
    mrp: float = 0
    price: float = 0
    discount_pct: int = 0
    evening_price: float | None = None


class CatalogueCategorySchema(StrictSchema):
    id: str
    name_en: str
    name_hi: str | None = None
    order: int = 0
    source_category_id: str | None = None
    items: list[CatalogueItemSchema] = []


class CatalogueBatchCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    template: str = "mandi-ledger"
    show_evening_price: bool = False
    show_evening_special_label: bool = False
    categories: list[CatalogueCategorySchema] = []


class CatalogueBatchUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    template: str | None = None
    show_evening_price: bool | None = None
    show_evening_special_label: bool | None = None
    categories: list[CatalogueCategorySchema] | None = None


class CatalogueBatchResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    template: str
    show_evening_price: bool
    show_evening_special_label: bool
    categories: list[CatalogueCategorySchema]
    created_at: datetime
    updated_at: datetime
