import { createBrowserRouter, type RouteObject } from "react-router";

import { LoginPage } from "@/features/auth/LoginPage";
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
import { PurchaseDetailPage } from "@/features/purchases/PurchaseDetailPage";
import { PurchaseFormPage } from "@/features/purchases/PurchaseFormPage";
import { PurchaseListPage } from "@/features/purchases/PurchaseListPage";
import { P, type Permission } from "@/features/auth/permissions";
import { AppLayout, type RouteHandle } from "@/layouts/AppLayout";
import { ComingSoon, NotFound } from "@/pages/Placeholders";

import { HomeRedirect, RequireAuth, RequirePermission } from "./guards";

function page(path: string, crumb: string, permission: Permission | null, element: React.ReactNode): RouteObject {
  return {
    path,
    handle: { crumb } satisfies RouteHandle,
    element: permission ? <RequirePermission permission={permission}>{element}</RequirePermission> : element,
  };
}

// Các module còn lại dùng trang tạm; sẽ thay bằng trang thật ở các bước tiếp theo của Giai đoạn 6
const upcoming: [string, string, Permission | null][] = [
  ["pos", "Bán hàng", P.ORDERS_CREATE],
  ["orders/*", "Đơn hàng", P.ORDERS_VIEW],
  ["returns", "Trả hàng", P.ORDERS_VIEW],
  ["reports", "Báo cáo", P.REPORTS_VIEW],
  ["users", "Người dùng", P.USERS_MANAGE],
  ["settings", "Cài đặt", P.SETTINGS_MANAGE],
  ["audit-logs", "Nhật ký", P.AUDIT_VIEW],
  ["profile", "Hồ sơ cá nhân", null],
];

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
      {
        path: "dashboard",
        handle: { crumb: "Tổng quan" } satisfies RouteHandle,
        // Tải theo nhu cầu: thư viện biểu đồ (Recharts) chỉ được tải khi mở Tổng quan
        lazy: async () => {
          const { DashboardPage } = await import("@/features/dashboard/DashboardPage");
          return {
            element: (
              <RequirePermission permission={P.REPORTS_VIEW}>
                <DashboardPage />
              </RequirePermission>
            ),
          };
        },
      },
      {
        path: "products",
        handle: { crumb: "Sản phẩm" } satisfies RouteHandle,
        children: [
          { index: true, element: <RequirePermission permission={P.CATALOG_VIEW}><ProductListPage /></RequirePermission> },
          page("new", "Thêm sản phẩm", P.CATALOG_MANAGE, <ProductFormPage key="new" />),
          page(":id", "Chi tiết", P.CATALOG_VIEW, <ProductDetailPage />),
          page(":id/edit", "Sửa sản phẩm", P.CATALOG_MANAGE, <ProductFormPage key="edit" />),
        ],
      },
      page("categories", "Danh mục & thương hiệu", P.CATALOG_VIEW, <CategoriesPage />),
      page("suppliers", "Nhà cung cấp", P.SUPPLIERS_MANAGE, <SuppliersPage />),
      {
        path: "customers",
        handle: { crumb: "Khách hàng" } satisfies RouteHandle,
        children: [
          { index: true, element: <RequirePermission permission={P.CUSTOMERS_VIEW}><CustomersPage /></RequirePermission> },
          page(":id", "Chi tiết", P.CUSTOMERS_VIEW, <CustomerDetailPage />),
        ],
      },
      {
        path: "purchases",
        handle: { crumb: "Nhập hàng" } satisfies RouteHandle,
        children: [
          { index: true, element: <RequirePermission permission={P.PURCHASES_MANAGE}><PurchaseListPage /></RequirePermission> },
          page("new", "Tạo phiếu nhập", P.PURCHASES_MANAGE, <PurchaseFormPage key="new" />),
          page(":id", "Chi tiết phiếu", P.PURCHASES_MANAGE, <PurchaseDetailPage />),
          page(":id/edit", "Sửa phiếu nháp", P.PURCHASES_MANAGE, <PurchaseFormPage key="edit" />),
        ],
      },
      {
        path: "inventory",
        handle: { crumb: "Tồn kho" } satisfies RouteHandle,
        children: [
          { index: true, element: <RequirePermission permission={P.INVENTORY_VIEW}><InventoryPage /></RequirePermission> },
          page("adjustments/new", "Phiếu điều chỉnh mới", P.INVENTORY_ADJUST, <AdjustmentFormPage />),
          page("adjustments/:id", "Phiếu điều chỉnh", P.INVENTORY_ADJUST, <AdjustmentDetailPage />),
        ],
      },
      ...upcoming.map(([path, crumb, permission]) => page(path, crumb, permission, <ComingSoon title={crumb} />)),
      { path: "*", element: <NotFound /> },
    ],
  },
]);
