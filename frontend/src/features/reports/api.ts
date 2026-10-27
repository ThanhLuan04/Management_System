import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { GroupBy, RevenueRow } from "@/features/dashboard/api";
import { http } from "@/services/http";
import type { Money } from "@/types/api";

export interface RevenueReport {
  period: { date_from: string; date_to: string; group_by: GroupBy };
  totals: {
    order_count: number;
    gross_revenue: Money;
    refunds: Money;
    net_revenue: Money;
    cogs: Money;
    gross_profit: Money;
    average_order_value: Money;
  };
  series: RevenueRow[];
}

export interface TopProductRow {
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  revenue: Money;
}

export interface InventoryReport {
  product_count: number;
  total_quantity: number;
  total_value: Money;
  low_stock_count: number;
  items: {
    product_id: number;
    sku: string;
    name: string;
    category_name: string;
    unit: string;
    is_active: boolean;
    quantity: number;
    min_stock: number;
    is_low_stock: boolean;
    avg_cost: Money;
    stock_value: Money;
  }[];
}

export interface SupplierPurchaseRow {
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  purchase_count: number;
  total_quantity: number;
  total_amount: Money;
}

function useReport<T>(path: string, params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["reports", path, params],
    queryFn: async () => (await http.get<T>(`/reports/${path}`, { params })).data,
    placeholderData: keepPreviousData,
  });
}

export const useRevenueReport = (params: Record<string, unknown>) => useReport<RevenueReport>("revenue", params);
export const useTopProducts = (params: Record<string, unknown>) => useReport<TopProductRow[]>("top-products", params);
export const useInventoryReport = (params: Record<string, unknown>) => useReport<InventoryReport>("inventory", params);
export const usePurchasesBySupplier = (params: Record<string, unknown>) =>
  useReport<SupplierPurchaseRow[]>("purchases-by-supplier", params);
