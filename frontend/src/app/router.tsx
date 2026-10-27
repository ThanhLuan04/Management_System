import type { ComponentType, ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";

import { LoginPage } from "@/features/auth/LoginPage";
import { P, type Permission } from "@/features/auth/permissions";
import { ProfilePage } from "@/features/auth/ProfilePage";
import { CategoriesPage } from "@/features/catalog/CategoriesPage";
import { ProductDetailPage } from "@/features/catalog/ProductDetailPage";
import { ProductFormPage } from "@/features/catalog/ProductFormPage";
import { ProductListPage } from "@/features/catalog/ProductListPage";
import { AdjustmentDetailPage } from "@/features/inventory/AdjustmentDetailPage";
import { AdjustmentFormPage } from "@/features/inventory/AdjustmentFormPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { CustomerDetailPage } from "@/features/partners/CustomerDetailPage";
import { CustomersPage } from "@/features/partners/CustomersPage";
import { SuppliersPage } from "@/features/partners/SuppliersPage";
import { PosPage } from "@/features/pos/PosPage";
import { PurchaseDetailPage } from "@/features/purchases/PurchaseDetailPage";
import { PurchaseFormPage } from "@/features/purchases/PurchaseFormPage";
import { PurchaseListPage } from "@/features/purchases/PurchaseListPage";
import { OrderDetailPage } from "@/features/sales/OrderDetailPage";
import { OrderListPage } from "@/features/sales/OrderListPage";
import { ReturnDetailPage, ReturnListPage } from "@/features/sales/ReturnPages";
import { AuditLogPage } from "@/features/system/AuditLogPage";
import { SettingsPage } from "@/features/system/SettingsPage";
import { UsersPage } from "@/features/users/UsersPage";
import { AppLayout, type RouteHandle } from "@/layouts/AppLayout";
import { NotFound } from "@/pages/Placeholders";

import { HomeRedirect, RequireAuth, RequirePermission } from "./guards";

function guarded(permission: Permission | null, element: ReactNode) {
  return permission ? <RequirePermission permission={permission}>{element}</RequirePermission> : element;
}

function page(path: string, crumb: string, permission: Permission | null, element: ReactNode): RouteObject {
  return { path, handle: { crumb } satisfies RouteHandle, element: guarded(permission, element) };
}

/** Trang tải theo nhu cầu — dùng cho trang có biểu đồ để Recharts không nằm trong bundle chính. */
function lazyPage(path: string, crumb: string, permission: Permission, load: () => Promise<ComponentType>): RouteObject {
  return {
    path,
    handle: { crumb } satisfies RouteHandle,
    lazy: async () => {
      const Component = await load();
      return { element: guarded(permission, <Component />) };
    },
  };
}

function section(path: string, crumb: string, permission: Permission, index: ReactNode, children: RouteObject[] = []): RouteObject {
  return {
    path,
    handle: { crumb } satisfies RouteHandle,
    children: [{ index: true, element: guarded(permission, index) }, ...children],
  };
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      lazyPage("dashboard", "Tổng quan", P.REPORTS_VIEW, async () => (await import("@/features/dashboard/DashboardPage")).DashboardPage),

      // Bán hàng
      page("pos", "Bán hàng", P.ORDERS_CREATE, <PosPage />),
      section("orders", "Đơn hàng", P.ORDERS_VIEW, <OrderListPage />, [page(":id", "Chi tiết đơn", P.ORDERS_VIEW, <OrderDetailPage />)]),
      section("returns", "Trả hàng", P.ORDERS_VIEW, <ReturnListPage />, [page(":id", "Chi tiết phiếu trả", P.ORDERS_VIEW, <ReturnDetailPage />)]),
      section("customers", "Khách hàng", P.CUSTOMERS_VIEW, <CustomersPage />, [page(":id", "Chi tiết", P.CUSTOMERS_VIEW, <CustomerDetailPage />)]),

      // Hàng hóa
      section("products", "Sản phẩm", P.CATALOG_VIEW, <ProductListPage />, [
        page("new", "Thêm sản phẩm", P.CATALOG_MANAGE, <ProductFormPage key="new" />),
        page(":id", "Chi tiết", P.CATALOG_VIEW, <ProductDetailPage />),
        page(":id/edit", "Sửa sản phẩm", P.CATALOG_MANAGE, <ProductFormPage key="edit" />),
      ]),
      page("categories", "Danh mục & thương hiệu", P.CATALOG_VIEW, <CategoriesPage />),
      section("purchases", "Nhập hàng", P.PURCHASES_MANAGE, <PurchaseListPage />, [
        page("new", "Tạo phiếu nhập", P.PURCHASES_MANAGE, <PurchaseFormPage key="new" />),
        page(":id", "Chi tiết phiếu", P.PURCHASES_MANAGE, <PurchaseDetailPage />),
        page(":id/edit", "Sửa phiếu nháp", P.PURCHASES_MANAGE, <PurchaseFormPage key="edit" />),
      ]),
      section("inventory", "Tồn kho", P.INVENTORY_VIEW, <InventoryPage />, [
        page("adjustments/new", "Phiếu điều chỉnh mới", P.INVENTORY_ADJUST, <AdjustmentFormPage />),
        page("adjustments/:id", "Phiếu điều chỉnh", P.INVENTORY_ADJUST, <AdjustmentDetailPage />),
      ]),
      page("suppliers", "Nhà cung cấp", P.SUPPLIERS_MANAGE, <SuppliersPage />),

      // Phân tích & hệ thống
      lazyPage("reports", "Báo cáo", P.REPORTS_VIEW, async () => (await import("@/features/reports/ReportsPage")).ReportsPage),
      page("users", "Người dùng", P.USERS_MANAGE, <UsersPage />),
      page("settings", "Cài đặt", P.SETTINGS_MANAGE, <SettingsPage />),
      page("audit-logs", "Nhật ký thao tác", P.AUDIT_VIEW, <AuditLogPage />),
      page("profile", "Hồ sơ cá nhân", null, <ProfilePage />),

      { path: "*", element: <NotFound /> },
    ],
  },
]);
