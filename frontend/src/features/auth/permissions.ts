/**
 * Mã quyền — khớp backend app/core/permissions.py. Frontend chỉ dùng để ẨN/HIỆN giao diện;
 * backend luôn tự kiểm tra quyền ở mọi API.
 */
export const P = {
  USERS_MANAGE: "users.manage",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
  CATALOG_VIEW: "catalog.view",
  CATALOG_MANAGE: "catalog.manage",
  SUPPLIERS_MANAGE: "suppliers.manage",
  PURCHASES_MANAGE: "purchases.manage",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ADJUST: "inventory.adjust",
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",
  ORDERS_CREATE: "orders.create",
  ORDERS_VIEW: "orders.view",
  ORDERS_CANCEL: "orders.cancel",
  RETURNS_CREATE: "returns.create",
  REPORTS_VIEW: "reports.view",
  REPORTS_OWN_SALES: "reports.own_sales",
  COST_VIEW: "cost.view",
} as const;

export type Permission = (typeof P)[keyof typeof P];
