import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Money } from "@/types/api";

import type { Product } from "./api";

export interface ModifierOption {
  id: number;
  name: string;
  /** Giá cộng thêm vào giá món (có thể âm) */
  price_delta: Money;
  /** Nguyên liệu trừ thêm cho 1 phần */
  ingredients: { ingredient: { id: number; sku: string; name: string; unit: string }; quantity: number }[];
}

export interface ModifierGroup {
  id: number;
  name: string;
  min_select: number;
  max_select: number;
  is_active: boolean;
  /** Chỉ lựa chọn đang dùng */
  options: ModifierOption[];
  /** Số món đang gắn nhóm này */
  dish_count: number;
}

export interface ModifierGroupPayload {
  name: string;
  min_select: number;
  max_select: number;
  is_active: boolean;
  options: {
    /** Có id = sửa lựa chọn cũ; không có = thêm mới. Lựa chọn cũ không gửi lên sẽ bị ngừng dùng. */
    id?: number;
    name: string;
    price_delta: number;
    ingredients: { ingredient_id: number; quantity: number }[];
  }[];
}

const keys = { groups: ["modifier-groups"] as const };

export function useModifierGroups() {
  return useQuery({
    queryKey: keys.groups,
    queryFn: async () => (await http.get<ModifierGroup[]>("/modifier-groups")).data,
  });
}

export function useSaveModifierGroup(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ModifierGroupPayload) =>
      id === undefined
        ? (await http.post<ModifierGroup>("/modifier-groups", payload)).data
        : (await http.put<ModifierGroup>(`/modifier-groups/${id}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.groups });
      queryClient.invalidateQueries({ queryKey: ["products"] }); // món đang dùng nhóm hiện lựa chọn mới
    },
  });
}

export function useSetProductModifiers(productId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupIds: number[]) =>
      (await http.put<Product>(`/products/${productId}/modifier-groups`, { group_ids: groupIds })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: keys.groups });
    },
  });
}

/** "+10.000 ₫", "−5.000 ₫", "" (0 ₫ không ghi). */
export function formatDelta(value: Money | number, format: (v: number) => string): string {
  const n = Number(value);
  if (!n) return "";
  return n > 0 ? `+${format(n)}` : `−${format(-n)}`;
}
