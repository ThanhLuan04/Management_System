import { createBrowserRouter, type RouteObject } from "react-router";

import { LoginPage } from "@/features/auth/LoginPage";
import { CategoriesPage } from "@/features/catalog/CategoriesPage";
import { ProductDetailPage } from "@/features/catalog/ProductDetailPage";
import { ProductFormPage } from "@/features/catalog/ProductFormPage";
import { ProductListPage } from "@/features/catalog/ProductListPage";
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
  ["customers/*", "Khách hàng", P.CUSTOMERS_VIEW],
  ["purchases/*", "Nhập hàng", P.PURCHASES_MANAGE],
  ["inventory", "Tồn kho", P.INVENTORY_VIEW],
  ["suppliers", "Nhà cung cấp", P.SUPPLIERS_MANAGE],
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
      ...upcoming.map(([path, crumb, permission]) => page(path, crumb, permission, <ComingSoon title={crumb} />)),
      { path: "*", element: <NotFound /> },
    ],
  },
]);
