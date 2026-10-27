import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState, ErrorState, PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select, Textarea } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import type { Product } from "@/features/catalog/api";
import { ProductPicker } from "@/features/catalog/ProductPicker";
import { useSupplierOptions } from "@/features/partners/api";
import { toApiError } from "@/services/apiError";
import { formatMoney, formatNumber } from "@/utils/format";

import { type Purchase, usePurchase, useSavePurchase } from "./api";
import { lineTotal, purchaseTotals } from "./calc";

const lineSchema = z
  .object({
    product_id: z.number(),
    sku: z.string(),
    name: z.string(),
    unit: z.string(),
    quantity: z.string().regex(/^[1-9]\d{0,6}$/, "SL từ 1"),
    unit_cost: z.string().min(1, "Nhập giá"),
    discount_amount: z.string(),
  })
  .refine((l) => lineTotal(l) >= 0, { message: "CK lớn hơn thành tiền", path: ["discount_amount"] });

const schema = z.object({
  supplier_id: z.string().min(1, "Vui lòng chọn nhà cung cấp"),
  note: z.string().max(1000, "Tối đa 1000 ký tự"),
  items: z.array(lineSchema).min(1, "Phiếu cần ít nhất một sản phẩm").max(200, "Tối đa 200 dòng"),
});
type FormValues = z.infer<typeof schema>;

function toFormValues(p: Purchase): FormValues {
  return {
    supplier_id: String(p.supplier.id),
    note: p.note ?? "",
    items: p.items.map((i) => ({
      product_id: i.product_id,
      sku: i.sku,
      name: i.product_name,
      unit: i.unit,
      quantity: String(i.quantity),
      unit_cost: String(Math.round(Number(i.unit_cost))),
      discount_amount: String(Math.round(Number(i.discount_amount))),
    })),
  };
}

export function PurchaseFormPage() {
  const { id } = useParams();
  const purchaseId = id ? Number(id) : undefined;
  const isEdit = purchaseId !== undefined;
  const navigate = useNavigate();
  const purchase = usePurchase(purchaseId);
  const suppliers = useSupplierOptions(true);
  const save = useSavePurchase(purchaseId);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { supplier_id: "", note: "", items: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const lines = useWatch({ control, name: "items" }) ?? [];
  const totals = purchaseTotals(lines);

  useEffect(() => {
    if (purchase.data) reset(toFormValues(purchase.data));
  }, [purchase.data, reset]);

  const addProduct = (product: Product) => {
    const index = getValues("items").findIndex((l) => l.product_id === product.id);
    if (index >= 0) {
      // Đã có trong phiếu → tăng số lượng thay vì thêm dòng trùng (backend không cho trùng sản phẩm)
      setValue(`items.${index}.quantity`, String(Number(getValues(`items.${index}.quantity`)) + 1), { shouldDirty: true });
      toast.info(`Đã tăng số lượng "${product.name}"`);
      return;
    }
    append({
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      quantity: "1",
      // Gợi ý giá nhập = giá vốn bình quân hiện tại (nếu có quyền xem)
      unit_cost: product.avg_cost && Number(product.avg_cost) > 0 ? String(Math.round(Number(product.avg_cost))) : "",
      discount_amount: "0",
    });
  };

  const onSubmit = (values: FormValues) =>
    save.mutate(
      {
        supplier_id: Number(values.supplier_id),
        note: values.note.trim() || null,
        items: values.items.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_cost: l.unit_cost,
          discount_amount: l.discount_amount || "0",
        })),
      },
      {
        onSuccess: (saved) => {
          toast.success(isEdit ? "Đã lưu phiếu nháp" : `Đã tạo phiếu nháp ${saved.code}`);
          navigate(`/purchases/${saved.id}`);
        },
        onError: (error) => {
          const apiError = toApiError(error);
          const fieldErrors = Object.entries(apiError.fieldErrors);
          if (fieldErrors.length === 0) {
            toast.error(apiError.message);
            return;
          }
          // "items.0.product_id" → báo lỗi ngay tại dòng tương ứng
          for (const [field, message] of fieldErrors) {
            setError(field as Parameters<typeof setError>[0], { message });
          }
          toast.error("Phiếu có dữ liệu chưa hợp lệ, kiểm tra các ô được đánh dấu");
        },
      },
    );

  if (isEdit && purchase.error) return <ErrorState error={purchase.error} onRetry={() => purchase.refetch()} />;
  if (isEdit && purchase.isPending) return <Skeleton className="h-96" />;
  if (isEdit && purchase.data && purchase.data.status !== "DRAFT") {
    return (
      <EmptyState
        title="Phiếu này không còn ở trạng thái nháp"
        description="Phiếu đã xác nhận hoặc đã hủy không thể sửa. Sai sót sau khi nhập kho được xử lý bằng phiếu điều chỉnh kho."
        action={<Link to={`/purchases/${purchaseId}`} className={buttonClass({ variant: "outline", size: "sm" })}>Xem phiếu</Link>}
      />
    );
  }

  return (
    <>
      <PageHeader title={isEdit ? `Sửa phiếu nháp ${purchase.data?.code}` : "Tạo phiếu nhập"} description="Lưu nháp chưa làm thay đổi tồn kho." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nhà cung cấp" htmlFor="supplier_id" required error={errors.supplier_id?.message}>
              <Select id="supplier_id" invalid={!!errors.supplier_id} {...register("supplier_id")}>
                <option value="">— Chọn nhà cung cấp —</option>
                {suppliers.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Ghi chú" htmlFor="note" error={errors.note?.message}>
              <Textarea id="note" rows={1} {...register("note")} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Hàng nhập" description="Chọn sản phẩm, nhập số lượng, đơn giá nhập và chiết khấu (nếu có)." />
          <CardContent className="space-y-4">
            <ProductPicker onSelect={addProduct} label="Thêm sản phẩm vào phiếu" />
            {errors.items?.message && (
              <p role="alert" className="text-sm text-destructive">
                {errors.items.message}
              </p>
            )}
            {fields.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Sản phẩm</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">Số lượng</th>
                      <th className="w-40 px-2 py-2 text-right font-medium">Giá nhập</th>
                      <th className="w-36 px-2 py-2 text-right font-medium">Chiết khấu</th>
                      <th className="w-36 px-2 py-2 text-right font-medium">Thành tiền</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fields.map((field, index) => {
                      const rowErrors = errors.items?.[index];
                      return (
                        <tr key={field.id} className="align-top">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{field.name}</span>
                            <span className="tabular block text-xs text-muted">
                              {field.sku} · {field.unit}
                            </span>
                            {rowErrors?.product_id?.message && <p className="text-xs text-destructive">{rowErrors.product_id.message}</p>}
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              aria-label={`Số lượng ${field.name}`}
                              inputMode="numeric"
                              className="text-right tabular"
                              invalid={!!rowErrors?.quantity}
                              {...register(`items.${index}.quantity`)}
                            />
                            {rowErrors?.quantity?.message && <p className="text-xs text-destructive">{rowErrors.quantity.message}</p>}
                          </td>
                          <td className="px-2 py-2">
                            <Controller
                              control={control}
                              name={`items.${index}.unit_cost`}
                              render={({ field: f }) => (
                                <MoneyInput aria-label={`Giá nhập ${field.name}`} invalid={!!rowErrors?.unit_cost} value={f.value} onChange={f.onChange} />
                              )}
                            />
                            {rowErrors?.unit_cost?.message && <p className="text-xs text-destructive">{rowErrors.unit_cost.message}</p>}
                          </td>
                          <td className="px-2 py-2">
                            <Controller
                              control={control}
                              name={`items.${index}.discount_amount`}
                              render={({ field: f }) => (
                                <MoneyInput aria-label={`Chiết khấu ${field.name}`} invalid={!!rowErrors?.discount_amount} value={f.value} onChange={f.onChange} />
                              )}
                            />
                            {rowErrors?.discount_amount?.message && (
                              <p className="text-xs text-destructive">{rowErrors.discount_amount.message}</p>
                            )}
                          </td>
                          <td className="tabular px-2 py-3 text-right font-medium">{formatMoney(lineTotal(lines[index] ?? field))}</td>
                          <td className="py-2 text-right">
                            <Button variant="ghost" size="icon" onClick={() => remove(index)} aria-label={`Xóa ${field.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {fields.length === 0 && <p className="py-6 text-center text-sm text-muted">Chưa có sản phẩm nào trong phiếu.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <div><dt className="inline text-muted">Tổng số lượng: </dt><dd className="tabular inline font-medium">{formatNumber(totals.quantity)}</dd></div>
              <div><dt className="inline text-muted">Chiết khấu: </dt><dd className="tabular inline font-medium">{formatMoney(totals.discount)}</dd></div>
              <div><dt className="inline text-muted">Tổng giá trị phiếu: </dt><dd className="tabular inline text-lg font-bold">{formatMoney(totals.total)}</dd></div>
            </dl>
            <div className="flex gap-2">
              <Link to={isEdit ? `/purchases/${purchaseId}` : "/purchases"} className={buttonClass({ variant: "outline" })}>
                Hủy
              </Link>
              <Button type="submit" loading={save.isPending}>
                Lưu nháp
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </>
  );
}
