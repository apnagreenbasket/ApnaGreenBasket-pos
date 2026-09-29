"""
Backward compatibility re-exports for restaurant schemas -> outlet schemas.
"""

from app.schemas.outlet import (
    OutletCreate as RestaurantCreate,
    OutletUpdate as RestaurantUpdate,
    OutletResponse as RestaurantResponse,
    OutletWithUsersResponse as RestaurantWithUsersResponse,
    UserSummaryResponse,
)

__all__ = [
    "RestaurantCreate",
    "RestaurantUpdate",
    "RestaurantResponse",
    "RestaurantWithUsersResponse",
    "UserSummaryResponse",
]
