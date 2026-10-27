import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorState, PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Spinner";
import { toApiError } from "@/services/apiError";
import { http } from "@/services/http";
import type { Money } from "@/types/api";

interface AdminSettings {
  store_name: string;
  store_address: string;
  store_phone: string;
  return_window_days: number;
  max_discount_percent_cashier: Money;
  max_discount_percent_manager: Money;
}

const percent = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Nhập số từ 0 đến 100")
  .refine((v) => Number(v) <= 100, "Tối đa 100%");

const schema = z.object({
  store_name: z.string().trim().min(1, "Vui lòng nhập tên cửa hàng").max(255, "Tối đa 255 ký tự"),
  store_address: z.string().trim().max(500, "Tối đa 500 ký tự"),
  store_phone: z.string().trim().max(20, "Tối đa 20 ký tự"),
  max_discount_percent_cashier: percent,
  max_discount_percent_manager: percent,
  return_window_days: z.string().regex(/^\d{1,3}$/, "Nhập số ngày từ 0 đến 365").refine((v) => Number(v) <= 365, "Tối đa 365 ngày"),
});
type FormValues = z.infer<typeof schema>;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings", "admin"],
    queryFn: async () => (await http.get<AdminSettings>("/settings")).data,
  });
  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await http.patch<AdminSettings>("/settings", payload)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (settings.data) {
      const s = settings.data;
      reset({
        store_name: s.store_name,
        store_address: s.store_address,
        store_phone: s.store_phone,
        max_discount_percent_cashier: String(Number(s.max_discount_percent_cashier)),
        max_discount_percent_manager: String(Number(s.max_discount_percent_manager)),
        return_window_days: String(s.return_window_days),
      });
    }
  }, [settings.data, reset]);

  if (settings.error) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  if (settings.isPending) return <Skeleton className="h-96" />;

  const onSubmit = (values: FormValues) =>
    save.mutate(
      { ...values, return_window_days: Number(values.return_window_days) },
      {
        onSuccess: () => toast.success("Đã lưu cài đặt — áp dụng ngay cho các giao dịch tiếp theo"),
        onError: (error) => {
          const apiError = toApiError(error);
          const fields = Object.entries(apiError.fieldErrors);
          if (fields.length) fields.forEach(([f, message]) => setError(f as keyof FormValues, { message }));
          else toast.error(apiError.message);
        },
      },
    );

  return (
    <>
      <PageHeader title="Cài đặt" description="Mọi thay đổi được ghi vào nhật ký thao tác." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Thông tin cửa hàng" description="In trên hóa đơn bán hàng" />
          <CardContent className="space-y-4">
            <FormField label="Tên cửa hàng" htmlFor="s-name" required error={errors.store_name?.message}>
              <Input id="s-name" invalid={!!errors.store_name} {...register("store_name")} />
            </FormField>
            <FormField label="Địa chỉ" htmlFor="s-address" error={errors.store_address?.message}>
              <Input id="s-address" invalid={!!errors.store_address} {...register("store_address")} />
            </FormField>
            <FormField label="Số điện thoại" htmlFor="s-phone" error={errors.store_phone?.message}>
              <Input id="s-phone" invalid={!!errors.store_phone} {...register("store_phone")} />
            </FormField>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Chính sách bán hàng" description="Kiểm tra ở máy chủ cho mọi đơn hàng" />
          <CardContent className="space-y-4">
            <FormField label="Giảm giá tối đa của Thu ngân (%)" htmlFor="s-cashier" required error={errors.max_discount_percent_cashier?.message}>
              <Input id="s-cashier" inputMode="decimal" invalid={!!errors.max_discount_percent_cashier} {...register("max_discount_percent_cashier")} />
            </FormField>
            <FormField label="Giảm giá tối đa của Quản lý (%)" htmlFor="s-manager" required error={errors.max_discount_percent_manager?.message} hint="Admin không bị giới hạn">
              <Input id="s-manager" inputMode="decimal" invalid={!!errors.max_discount_percent_manager} {...register("max_discount_percent_manager")} />
            </FormField>
            <FormField label="Thời hạn đổi trả (ngày)" htmlFor="s-window" required error={errors.return_window_days?.message}>
              <Input id="s-window" inputMode="numeric" invalid={!!errors.return_window_days} {...register("return_window_days")} />
            </FormField>
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Lưu cài đặt
          </Button>
        </div>
      </form>
    </>
  );
}
