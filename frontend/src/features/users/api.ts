import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/services/http";
import type { Page, Role } from "@/types/api";

export interface UserRow {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_id: number;
}

export type UserUpdatePayload = Partial<Pick<UserCreatePayload, "full_name" | "email" | "phone" | "role_id">>;

export function useUsers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["users", "list", params],
    queryFn: async () => (await http.get<Page<UserRow>>("/users", { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await http.get<Role[]>("/roles")).data,
    staleTime: Infinity,
  });
}

function useUserMutation<T>(fn: (payload: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }) });
}

export const useCreateUser = () =>
  useUserMutation(async (payload: UserCreatePayload) => (await http.post<UserRow>("/users", payload)).data);

export const useUpdateUser = (id: number) =>
  useUserMutation(async (payload: UserUpdatePayload) => (await http.patch<UserRow>(`/users/${id}`, payload)).data);

export const useSetUserStatus = (id: number) =>
  useUserMutation(async (is_active: boolean) => (await http.patch<UserRow>(`/users/${id}/status`, { is_active })).data);

export const useResetPassword = (id: number) =>
  useUserMutation(async (new_password: string) => http.post(`/users/${id}/reset-password`, { new_password }));
