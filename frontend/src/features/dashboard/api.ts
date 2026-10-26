import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Money, UserRef } from "@/types/api";

export type GroupBy = "day" | "week" | "month";

export interface RevenueRow {
  period: string;
  order_count: number;
  gross_revenue: Money;
  refunds: Money;
  net_revenue: Money;
  cogs: Money;
  gross_profit: Money;
}

export interface OrderSummary {
  id: number;
  code: string;
  status: "COMPLETED" | "CANCELLED";
  return_status: "NONE" | "PARTIAL" | "FULL";
  customer: { id: number; code: string; name: string; phone: string | null } | null;
  total_amount: Money;
  item_count: number;
  payment_method: string | null;
  created_by: UserRef;
  created_at: string;
}

export interface DashboardData {
  period: { date_from: string; date_to: string; group_by: GroupBy };
  kpis: {
    today_net_revenue: Money;
    today_order_count: number;
    net_revenue: Money;
    gross_revenue: Money;
    refunds: Money;
    order_count: number;
    gross_profit: Money;
    active_product_count: number;
    low_stock_count: number;
    inventory_value: Money;
  };
  revenue_series: RevenueRow[];
  top_products: { product_id: number; sku: string; name: string; quantity: number; revenue: Money }[];
  recent_orders: OrderSummary[];
  low_stock_items: { product_id: number; sku: string; name: string; quantity: number; min_stock: number }[];
}

export interface DashboardParams {
  date_from: string;
  date_to: string;
  group_by: GroupBy;
}

export function useDashboard(params: DashboardParams) {
  return useQuery({
    queryKey: ["reports", "dashboard", params],
    queryFn: async () => (await http.get<DashboardData>("/reports/dashboard", { params })).data,
    // Đổi bộ lọc: giữ số liệu cũ (làm mờ) trong lúc tải số liệu mới, không nháy khung trống
    placeholderData: keepPreviousData,
  });
}
