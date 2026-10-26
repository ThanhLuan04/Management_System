import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Money, Page, UserRef } from "@/types/api";

// ---------- Kiểu dữ liệu ----------

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  parent_name: string | null;
  description: string | null;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryNode extends Category {
  children: Category[];
}

export interface Brand {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category: { id: number; name: string };
  brand: { id: number; name: string } | null;
  unit: string;
  sale_price: Money;
  min_stock: number;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  quantity: number;
  is_low_stock: boolean;
  /** Chỉ có khi người dùng có quyền cost.view */
  avg_cost?: Money;
  created_at: string;
  updated_at: string;
}

export interface ProductPayload {
  sku: string;
  barcode: string | null;
  name: string;
  category_id: number;
  brand_id: number | null;
  unit: string;
  sale_price: string;
  min_stock: number;
  description: string | null;
  is_active: boolean;
}

export interface StockTransaction {
  id: number;
  type: "PURCHASE" | "SALE" | "SALE_RETURN" | "ORDER_CANCEL" | "ADJUSTMENT";
  quantity_change: number;
  quantity_after: number;
  unit_cost?: Money;
  reference_type: string;
  reference_id: number;
  reference_code: string | null;
  note: string | null;
  created_by: UserRef;
  created_at: string;
}

export interface ProductStock {
  product_id: number;
  quantity: number;
  min_stock: number;
  is_low_stock: boolean;
  avg_cost?: Money;
  recent_transactions: StockTransaction[];
}

// ---------- Truy vấn ----------

const keys = {
  products: ["products"] as const,
  categories: ["categories"] as const,
  brands: ["brands"] as const,
};

export function useProducts(params: Record<string, unknown>) {
  return useQuery({
    queryKey: [...keys.products, "list", params],
    queryFn: async () => (await http.get<Page<Product>>("/products", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: number | undefined) {
  return useQuery({
    queryKey: [...keys.products, "detail", id],
    queryFn: async () => (await http.get<Product>(`/products/${id}`)).data,
    enabled: id !== undefined,
  });
}

export function useProductStock(id: number) {
  return useQuery({
    queryKey: [...keys.products, "stock", id],
    queryFn: async () => (await http.get<ProductStock>(`/products/${id}/inventory`)).data,
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: [...keys.categories, "tree"],
    queryFn: async () => (await http.get<CategoryNode[]>("/categories", { params: { tree: true } })).data,
    staleTime: 5 * 60_000,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: keys.brands,
    queryFn: async () => (await http.get<Brand[]>("/brands")).data,
    staleTime: 5 * 60_000,
  });
}

// ---------- Ghi dữ liệu ----------

export function useSaveProduct(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductPayload) =>
      id === undefined
        ? (await http.post<Product>("/products", payload)).data
        : (await http.patch<Product>(`/products/${id}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.categories }); // số sản phẩm trong danh mục thay đổi
    },
  });
}

export function useSetProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      (await http.patch<Product>(`/products/${id}`, { is_active })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export function useUploadProductImage(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await http.post<Product>(`/products/${id}/image`, form)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.products }),
  });
}

export function useSaveCategory(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Pick<Category, "name" | "parent_id" | "description" | "is_active">>) =>
      id === undefined
        ? (await http.post<Category>("/categories", payload)).data
        : (await http.patch<Category>(`/categories/${id}`, payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useSaveBrand(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Pick<Brand, "name" | "is_active">>) =>
      id === undefined
        ? (await http.post<Brand>("/brands", payload)).data
        : (await http.patch<Brand>(`/brands/${id}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.brands });
      queryClient.invalidateQueries({ queryKey: keys.products });
    },
  });
}

/** Danh mục dạng phẳng cho ô chọn: danh mục con thụt lề dưới danh mục cha. */
export function flattenCategories(tree: CategoryNode[] | undefined, activeOnly = false) {
  const options: { id: number; label: string; isActive: boolean }[] = [];
  for (const root of tree ?? []) {
    if (activeOnly && !root.is_active) continue;
    options.push({ id: root.id, label: root.name, isActive: root.is_active });
    for (const child of root.children) {
      if (activeOnly && !child.is_active) continue;
      options.push({ id: child.id, label: `   — ${child.name}`, isActive: child.is_active });
    }
  }
  return options;
}
