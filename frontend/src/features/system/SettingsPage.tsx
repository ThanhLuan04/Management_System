import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorState, PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import { TransferQr } from "@/features/pos/TransferQr";
import { toApiError } from "@/services/apiError";
import { http } from "@/services/http";
import type { Money } from "@/types/api";

import { VIETQR_BANKS } from "./banks";

interface AdminSettings {
  store_name: string;
  store_address: string;
  store_phone: string;
  return_window_days: number;
  bank_bin: string;
  bank_account_number: string;
  bank_account_name: string;
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
  bank_bin: z.string(),
  bank_account_number: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9A-Za-z]{1,19}$/.test(v), "Số tài khoản gồm 1–19 chữ/số, không dấu cách"),
  bank_account_name: z.string().trim().max(50, "Tối đa 50 ký tự"),
}).superRefine((v, ctx) => {
  // Ngân hàng và số tài khoản phải có cùng nhau (để trống cả hai = không dùng QR)
  if (v.bank_bin && !v.bank_account_number) ctx.addIssue({ code: "custom", path: ["bank_account_number"], message: "Nhập số tài khoản nhận tiền" });
  if (!v.bank_bin && v.bank_account_number) ctx.addIssue({ code: "custom", path: ["bank_bin"], message: "Chọn ngân hàng" });
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
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const preview = useWatch({ control });

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
        bank_bin: s.bank_bin,
        bank_account_number: s.bank_account_number,
        bank_account_name: s.bank_account_name,
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
        <Card className="lg:col-span-2">
          <CardHeader
            title="Nhận chuyển khoản (VietQR)"
            description="Màn hình bán hàng hiện mã QR có sẵn số tiền để khách quét bằng app ngân hàng. Để trống = không dùng QR."
          />
          <CardContent className="grid gap-6 md:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <FormField label="Ngân hàng" htmlFor="s-bank" error={errors.bank_bin?.message}>
                <Select id="s-bank" invalid={!!errors.bank_bin} {...register("bank_bin")}>
                  <option value="">— Không dùng —</option>
                  {VIETQR_BANKS.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.shortName} — {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Số tài khoản" htmlFor="s-account" error={errors.bank_account_number?.message}>
                <Input id="s-account" inputMode="numeric" invalid={!!errors.bank_account_number} {...register("bank_account_number")} />
              </FormField>
              <FormField label="Tên chủ tài khoản" htmlFor="s-account-name" error={errors.bank_account_name?.message} hint="Hiện dưới mã QR để khách đối chiếu, vd. NGUYEN VAN AN">
                <Input id="s-account-name" invalid={!!errors.bank_account_name} {...register("bank_account_name")} />
              </FormField>
            </div>
            {/* Xem trước: quét thử bằng app ngân hàng để chắc chắn tài khoản đúng trước khi dùng thật */}
            {preview.bank_bin && preview.bank_account_number && /^[0-9A-Za-z]{1,19}$/.test(preview.bank_account_number) && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Quét thử (10.000 ₫)</p>
                <TransferQr
                  bankBin={preview.bank_bin}
                  accountNumber={preview.bank_account_number}
                  accountName={preview.bank_account_name ?? ""}
                  amount={10000}
                  note="SMARTSTORE THU"
                  size={160}
                />
              </div>
            )}
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
