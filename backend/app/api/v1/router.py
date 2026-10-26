from fastapi import APIRouter

from app.api.v1 import (
    auth,
    catalog,
    health,
    inventory,
    orders,
    partners,
    products,
    purchases,
    returns,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalog.router)
api_router.include_router(products.router)
api_router.include_router(partners.router)
api_router.include_router(purchases.router)
api_router.include_router(inventory.router)
api_router.include_router(orders.router)
api_router.include_router(returns.router)
