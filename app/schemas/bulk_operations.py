"""
Schemas for bulk import/export operations.
"""
from __future__ import annotations

import enum

from pydantic import BaseModel, Field


class BulkImportSummary(BaseModel):
    """Response schema for all bulk import endpoints."""

    total_rows: int = Field(description="Total rows in the uploaded file")
    created: int = Field(description="Number of new records created")
    updated: int = Field(description="Number of existing records updated")
    skipped: int = Field(description="Number of rows skipped due to errors")
    errors: list[dict] = Field(
        default_factory=list, description="List of {row, field, message} error dicts"
    )


class ExportFormatEnum(str, enum.Enum):
    CSV = "csv"
    EXCEL = "excel"
    PDF = "pdf"
