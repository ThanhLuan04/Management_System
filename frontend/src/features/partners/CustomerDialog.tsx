import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Select";
import { toApiError } from "@/services/apiError";

import { type Customer, useSaveCustomer } from "./api";

const schema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng").max(255, "Tối đa 255 ký tự"),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^(\+84|84|0)[0-9 .]{8,13}$/.test(v), "Số điện thoại không hợp lệ"),
  email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ"),
  address: z.string().trim().max(500, "Tối đa 500 ký tự"),
  note: z.string().max(2000, "Tối đa 2000 ký tự"),
});
type FormValues = z.infer<typeof schema>;

/** Thêm/sửa khách hàng — dùng ở trang Khách hàng và màn hình bán hàng (thêm nhanh khách mới tại quầy). */
export function CustomerDialog({
  open,
  onOpenChange,
  editing,
  initialPhone,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Customer | null;
  initialPhone?: string;
  onSaved?: (customer: Customer) => void;
}) {
  const save = useSaveCustomer(editing?.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        name: editing?.name ?? "",
        phone: editing?.phone ?? initialPhone ?? "",
        email: editing?.email ?? "",
        address: editing?.address ?? "",
        note: editing?.note ?? "",
      });
    }
  }, [open, editing, initialPhone, reset]);

  const onSubmit = (values: FormValues) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        toast.success(editing ? "Đã lưu khách hàng" : `Đã tạo khách hàng ${saved.code}`);
        onSaved?.(saved);
        onOpenChange(false);
      },
      onError: (error) => {
        const apiError = toApiError(error);
        if (apiError.code === "DUPLICATE_PHONE") setError("phone", { message: apiError.message }, { shouldFocus: true });
        else if (Object.keys(apiError.fieldErrors).length)
          Object.entries(apiError.fieldErrors).forEach(([f, message]) => setError(f as keyof FormValues, { message }));
        else toast.error(apiError.message);
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Sửa khách hàng ${editing.code}` : "Thêm khách hàng"}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="customer-form" loading={save.isPending}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField label="Tên khách hàng" htmlFor="customer-name" required error={errors.name?.message}>
          <Input id="customer-name" autoFocus invalid={!!errors.name} {...register("name")} />
        </FormField>
        <FormField label="Số điện thoại" htmlFor="customer-phone" error={errors.phone?.message} hint="Dùng để tìm khách nhanh ở quầy">
          <Input id="customer-phone" inputMode="tel" invalid={!!errors.phone} {...register("phone")} />
        </FormField>
        <FormField label="Email" htmlFor="customer-email" error={errors.email?.message}>
          <Input id="customer-email" type="email" invalid={!!errors.email} {...register("email")} />
        </FormField>
        <FormField label="Địa chỉ" htmlFor="customer-address" error={errors.address?.message}>
          <Input id="customer-address" {...register("address")} />
        </FormField>
        <FormField label="Ghi chú" htmlFor="customer-note" error={errors.note?.message}>
          <Textarea id="customer-note" rows={2} {...register("note")} />
        </FormField>
      </form>
    </Dialog>
  );
}
