import type { ComponentType } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";

import { Spinner } from "@/components/ui/Spinner";
import { P, type Permission } from "@/features/auth/permissions";
import { AppLayout, type RouteHandle } from "@/layouts/AppLayout";
import { NotFound } from "@/pages/Placeholders";

import { HomeRedirect, RequireAuth, RequirePermission } from "./guards";

/**
 * Mọi trang đều tải theo nhu cầu: bundle ban đầu chỉ gồm khung ứng dụng; thư viện form (zod, react-hook-form)
 * và biểu đồ (Recharts) chỉ tải khi mở trang cần đến. Khi chuyển trang, trang cũ được giữ đến khi trang mới tải xong
 * (thanh tiến trình trên đầu trang — AppLayout).
 */
type Loader = () => Promise<ComponentType>;

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8 text-primary" label="Đang tải" />
    </div>
  );
}

function lazyElement(load: Loader, permission: Permission | null, key?: string): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => {
      const Component = await load();
      const element = <Component key={key} />;
      return { element: permission ? <RequirePermission permission={permission}>{element}</RequirePermission> : element };
    },
  };
}

function page(path: string, crumb: string, permission: Permission | null, load: Loader, key?: string): RouteObject {
  return { path, handle: { crumb } satisfies RouteHandle, ...lazyElement(load, permission, key) };
}

function section(path: string, crumb: string, permission: Permission, index: Loader, children: RouteObject[] = []): RouteObject {
  return {
    path,
    handle: { crumb } satisfies RouteHandle,
    children: [{ index: true, ...lazyElement(index, permission) }, ...children],
  };
}

export const router = createBrowserRouter([
  {
    path: "/login",
    HydrateFallback: PageLoading,
    lazy: async () => ({ Component: (await import("@/features/auth/LoginPage")).LoginPage }),
  },
  {
    path: "/",
    HydrateFallback: PageLoading,
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      page("dashboard", "Tổng quan", P.REPORTS_VIEW, async () => (await import("@/features/dashboard/DashboardPage")).DashboardPage),

      // Bán hàng
      page("pos", "Bán hàng", P.ORDERS_CREATE, async () => (await import("@/features/pos/PosPage")).PosPage),
      section("orders", "Đơn hàng", P.ORDERS_VIEW, async () => (await import("@/features/sales/OrderListPage")).OrderListPage, [
        page(":id", "Chi tiết đơn", P.ORDERS_VIEW, async () => (await import("@/features/sales/OrderDetailPage")).OrderDetailPage),
      ]),
      section("returns", "Trả hàng", P.ORDERS_VIEW, async () => (await import("@/features/sales/ReturnPages")).ReturnListPage, [
        page(":id", "Chi tiết phiếu trả", P.ORDERS_VIEW, async () => (await import("@/features/sales/ReturnPages")).ReturnDetailPage),
      ]),
      section("customers", "Khách hàng", P.CUSTOMERS_VIEW, async () => (await import("@/features/partners/CustomersPage")).CustomersPage, [
        page(":id", "Chi tiết", P.CUSTOMERS_VIEW, async () => (await import("@/features/partners/CustomerDetailPage")).CustomerDetailPage),
      ]),

      // Hàng hóa
      section("products", "Sản phẩm", P.CATALOG_VIEW, async () => (await import("@/features/catalog/ProductListPage")).ProductListPage, [
        // key khác nhau → chuyển giữa "thêm" và "sửa" thì form được tạo lại từ đầu
        page("new", "Thêm sản phẩm", P.CATALOG_MANAGE, async () => (await import("@/features/catalog/ProductFormPage")).ProductFormPage, "new"),
        page(":id", "Chi tiết", P.CATALOG_VIEW, async () => (await import("@/features/catalog/ProductDetailPage")).ProductDetailPage),
        page(":id/edit", "Sửa sản phẩm", P.CATALOG_MANAGE, async () => (await import("@/features/catalog/ProductFormPage")).ProductFormPage, "edit"),
      ]),
      page("categories", "Danh mục & thương hiệu", P.CATALOG_VIEW, async () => (await import("@/features/catalog/CategoriesPage")).CategoriesPage),
      section("purchases", "Nhập hàng", P.PURCHASES_MANAGE, async () => (await import("@/features/purchases/PurchaseListPage")).PurchaseListPage, [
        page("new", "Tạo phiếu nhập", P.PURCHASES_MANAGE, async () => (await import("@/features/purchases/PurchaseFormPage")).PurchaseFormPage, "new"),
        page(":id", "Chi tiết phiếu", P.PURCHASES_MANAGE, async () => (await import("@/features/purchases/PurchaseDetailPage")).PurchaseDetailPage),
        page(":id/edit", "Sửa phiếu nháp", P.PURCHASES_MANAGE, async () => (await import("@/features/purchases/PurchaseFormPage")).PurchaseFormPage, "edit"),
      ]),
      section("inventory", "Tồn kho", P.INVENTORY_VIEW, async () => (await import("@/features/inventory/InventoryPage")).InventoryPage, [
        page("adjustments/new", "Phiếu điều chỉnh mới", P.INVENTORY_ADJUST, async () => (await import("@/features/inventory/AdjustmentFormPage")).AdjustmentFormPage),
        page("adjustments/:id", "Phiếu điều chỉnh", P.INVENTORY_ADJUST, async () => (await import("@/features/inventory/AdjustmentDetailPage")).AdjustmentDetailPage),
      ]),
      page("suppliers", "Nhà cung cấp", P.SUPPLIERS_MANAGE, async () => (await import("@/features/partners/SuppliersPage")).SuppliersPage),

      // Phân tích & hệ thống
      page("reports", "Báo cáo", P.REPORTS_VIEW, async () => (await import("@/features/reports/ReportsPage")).ReportsPage),
      page("users", "Người dùng", P.USERS_MANAGE, async () => (await import("@/features/users/UsersPage")).UsersPage),
      page("settings", "Cài đặt", P.SETTINGS_MANAGE, async () => (await import("@/features/system/SettingsPage")).SettingsPage),
      page("audit-logs", "Nhật ký thao tác", P.AUDIT_VIEW, async () => (await import("@/features/system/AuditLogPage")).AuditLogPage),
      page("profile", "Hồ sơ cá nhân", null, async () => (await import("@/features/auth/ProfilePage")).ProfilePage),

      { path: "*", element: <NotFound /> },
    ],
  },
]);
