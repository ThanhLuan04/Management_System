from enum import StrEnum


class RoleCode(StrEnum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    CASHIER = "CASHIER"


class Permission(StrEnum):
    USERS_MANAGE = "users.manage"
    SETTINGS_MANAGE = "settings.manage"
    AUDIT_VIEW = "audit.view"
    CATALOG_VIEW = "catalog.view"
    CATALOG_MANAGE = "catalog.manage"
    SUPPLIERS_MANAGE = "suppliers.manage"
    PURCHASES_MANAGE = "purchases.manage"
    INVENTORY_VIEW = "inventory.view"
    INVENTORY_ADJUST = "inventory.adjust"
    CUSTOMERS_VIEW = "customers.view"
    CUSTOMERS_MANAGE = "customers.manage"
    ORDERS_CREATE = "orders.create"
    ORDERS_VIEW = "orders.view"
    ORDERS_CANCEL = "orders.cancel"
    RETURNS_CREATE = "returns.create"
    REPORTS_VIEW = "reports.view"
    REPORTS_OWN_SALES = "reports.own_sales"
    COST_VIEW = "cost.view"


_CASHIER = frozenset(
    {
        Permission.CATALOG_VIEW,
        Permission.INVENTORY_VIEW,
        Permission.CUSTOMERS_VIEW,
        Permission.CUSTOMERS_MANAGE,
        Permission.ORDERS_CREATE,
        Permission.ORDERS_VIEW,
        Permission.RETURNS_CREATE,
        Permission.REPORTS_OWN_SALES,
    }
)

_MANAGER = _CASHIER | {
    Permission.CATALOG_MANAGE,
    Permission.SUPPLIERS_MANAGE,
    Permission.PURCHASES_MANAGE,
    Permission.INVENTORY_ADJUST,
    Permission.ORDERS_CANCEL,
    Permission.REPORTS_VIEW,
    Permission.COST_VIEW,
}

# Ma trận phân quyền — xem docs/01-business-spec.md §3
ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    RoleCode.ADMIN: frozenset(Permission),
    RoleCode.MANAGER: frozenset(_MANAGER),
    RoleCode.CASHIER: _CASHIER,
}


def permissions_for(role_code: str) -> frozenset[Permission]:
    return ROLE_PERMISSIONS.get(role_code, frozenset())
