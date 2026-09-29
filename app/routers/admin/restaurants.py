"""
Legacy restaurant router deprecated — replaced by outlets.py
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/admin/restaurants", tags=["admin-restaurants"])
