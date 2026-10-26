import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardList,
  FolderTree,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  UserCog,
  Users,
  Warehouse,
} from "lucide-react";

import { P, type Permission } from "@/features/auth/permissions";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Chỉ hiện mục menu khi người dùng có quyền này (backend vẫn tự kiểm tra quyền). */
  permission: Permission;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [{ to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, permission: P.REPORTS_VIEW }],
  },
  {
    label: "Bán hàng",
    items: [
      { to: "/pos", label: "Bán hàng", icon: ShoppingCart, permission: P.ORDERS_CREATE },
      { to: "/orders", label: "Đơn hàng", icon: ClipboardList, permission: P.ORDERS_VIEW },
      { to: "/returns", label: "Trả hàng", icon: Undo2, permission: P.ORDERS_VIEW },
      { to: "/customers", label: "Khách hàng", icon: Users, permission: P.CUSTOMERS_VIEW },
    ],
  },
  {
    label: "Hàng hóa",
    items: [
      { to: "/products", label: "Sản phẩm", icon: Package, permission: P.CATALOG_VIEW },
      { to: "/categories", label: "Danh mục", icon: FolderTree, permission: P.CATALOG_VIEW },
      { to: "/purchases", label: "Nhập hàng", icon: ArrowLeftRight, permission: P.PURCHASES_MANAGE },
      { to: "/inventory", label: "Tồn kho", icon: Warehouse, permission: P.INVENTORY_VIEW },
      { to: "/suppliers", label: "Nhà cung cấp", icon: Truck, permission: P.SUPPLIERS_MANAGE },
    ],
  },
  {
    label: "Phân tích",
    items: [{ to: "/reports", label: "Báo cáo", icon: BarChart3, permission: P.REPORTS_VIEW }],
  },
  {
    label: "Hệ thống",
    items: [
      { to: "/users", label: "Người dùng", icon: UserCog, permission: P.USERS_MANAGE },
      { to: "/settings", label: "Cài đặt", icon: Settings, permission: P.SETTINGS_MANAGE },
      { to: "/audit-logs", label: "Nhật ký", icon: History, permission: P.AUDIT_VIEW },
    ],
  },
];

export const BRAND_ICON = Boxes;
