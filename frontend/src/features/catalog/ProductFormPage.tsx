import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorState, PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select, Textarea } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import { toApiError } from "@/services/apiError";
import { formatMoney, formatNumber } from "@/utils/format";

import { flattenCategories, type Product, useBrands, useCategoryTree, useProduct, useSaveProduct, useUploadProductImage } from "./api";
import { ProductThumb } from "./components";

const schema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập SKU")
    .max(50, "Tối đa 50 ký tự")
    .regex(/^[A-Za-z0-9_-]+$/, "SKU chỉ gồm chữ không dấu, số, '-' và '_'"),
  barcode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z0-9-]{4,50}$/.test(v), "Mã vạch gồm 4–50 chữ/số"),
  name: z.string().trim().min(1, "Vui lòng nhập tên sản phẩm").max(255, "Tối đa 255 ký tự"),
  category_id: z.string().min(1, "Vui lòng chọn danh mục"),
  brand_id: z.string(),
  unit: z.string().trim().min(1, "Vui lòng nhập đơn vị tính").max(20, "Tối đa 20 ký tự"),
  sale_price: z.string().min(1, "Vui lòng nhập giá bán"),
  min_stock: z.string().regex(/^\d{1,7}$/, "Nhập số nguyên ≥ 0"),
  description: z.string().max(2000, "Tối đa 2000 ký tự"),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  sku: "",
  barcode: "",
  name: "",
  category_id: "",
  brand_id: "",
  unit: "",
  sale_price: "",
  min_stock: "0",
  description: "",
  is_active: true,
};

function toFormValues(p: Product): FormValues {
  return {
    sku: p.sku,
    barcode: p.barcode ?? "",
    name: p.name,
    category_id: String(p.category.id),
    brand_id: p.brand ? String(p.brand.id) : "",
    unit: p.unit,
    sale_price: String(Math.round(Number(p.sale_price))),
    min_stock: String(p.min_stock),
    description: p.description ?? "",
    is_active: p.is_active,
  };
}

/** Gắn lỗi từ server vào đúng ô nhập; trả về false nếu không gắn được (để báo lỗi chung). */
function applyServerErrors(error: unknown, setError: UseFormSetError<FormValues>): boolean {
  const apiError = toApiError(error);
  if (apiError.code === "DUPLICATE_SKU") {
    setError("sku", { message: apiError.message }, { shouldFocus: true });
    return true;
  }
  if (apiError.code === "DUPLICATE_BARCODE") {
    setError("barcode", { message: apiError.message }, { shouldFocus: true });
    return true;
  }
  const fields = Object.entries(apiError.fieldErrors).filter(([field]) => field in EMPTY);
  fields.forEach(([field, message]) => setError(field as keyof FormValues, { message }));
  return fields.length > 0;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function ImageUploader({ product }: { product: Product }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadProductImage(product.id);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    // Kiểm tra sớm ở trình duyệt cho nhanh; server vẫn kiểm tra lại nội dung file
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Ảnh tối đa 2MB");
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success("Đã cập nhật ảnh sản phẩm"),
      onError: (error) => toast.error(toApiError(error).message),
    });
  };

  return (
    <div className="flex items-center gap-4">
      <ProductThumb url={product.image_url} name={product.name} className="h-24 w-24 rounded-xl text-3xl" />
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = ""; // cho phép chọn lại cùng một file
          }}
        />
        <Button variant="outline" size="sm" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" aria-hidden /> {product.image_url ? "Đổi ảnh" : "Tải ảnh lên"}
        </Button>
        <p className="text-xs text-muted">JPEG, PNG hoặc WebP, tối đa 2MB</p>
      </div>
    </div>
  );
}

export function ProductFormPage() {
  const { id } = useParams();
  const productId = id ? Number(id) : undefined;
  const isEdit = productId !== undefined;
  const navigate = useNavigate();

  const product = useProduct(productId);
  const { data: categoryTree } = useCategoryTree();
  const { data: brands } = useBrands();
  const save = useSaveProduct(productId);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (product.data) reset(toFormValues(product.data));
  }, [product.data, reset]);

  const onSubmit = (values: FormValues) => {
    save.mutate(
      {
        sku: values.sku.trim().toUpperCase(),
        barcode: values.barcode || null,
        name: values.name,
        category_id: Number(values.category_id),
        brand_id: values.brand_id ? Number(values.brand_id) : null,
        unit: values.unit,
        sale_price: values.sale_price,
        min_stock: Number(values.min_stock),
        description: values.description || null,
        is_active: values.is_active,
      },
      {
        onSuccess: (saved) => {
          if (isEdit) {
            toast.success("Đã lưu sản phẩm");
            navigate(`/products/${saved.id}`);
          } else {
            toast.success("Đã tạo sản phẩm. Bạn có thể thêm ảnh ngay bây giờ.");
            navigate(`/products/${saved.id}/edit`, { replace: true });
          }
        },
        onError: (error) => {
          if (!applyServerErrors(error, setError)) toast.error(toApiError(error).message);
        },
      },
    );
  };

  if (isEdit && product.error) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  if (isEdit && product.isPending) return <Skeleton className="h-96" />;

  // Danh mục đang dùng của sản phẩm vẫn hiện trong danh sách dù đã ngừng sử dụng
  const categoryOptions = flattenCategories(categoryTree).filter(
    (o) => o.isActive || String(o.id) === product.data?.category.id.toString(),
  );

  return (
    <>
      <PageHeader title={isEdit ? `Sửa: ${product.data?.name}` : "Thêm sản phẩm"} />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Thông tin sản phẩm" />
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="SKU" htmlFor="sku" required error={errors.sku?.message} hint="Tự viết hoa khi lưu">
              <Input id="sku" invalid={!!errors.sku} {...register("sku")} />
            </FormField>
            <FormField label="Mã vạch" htmlFor="barcode" error={errors.barcode?.message}>
              <Input id="barcode" invalid={!!errors.barcode} {...register("barcode")} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Tên sản phẩm" htmlFor="name" required error={errors.name?.message}>
                <Input id="name" invalid={!!errors.name} {...register("name")} />
              </FormField>
            </div>
            <FormField label="Danh mục" htmlFor="category_id" required error={errors.category_id?.message}>
              <Select id="category_id" invalid={!!errors.category_id} {...register("category_id")}>
                <option value="">— Chọn danh mục —</option>
                {categoryOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Thương hiệu" htmlFor="brand_id" error={errors.brand_id?.message}>
              <Select id="brand_id" {...register("brand_id")}>
                <option value="">— Không có —</option>
                {brands
                  ?.filter((b) => b.is_active || String(b.id) === String(product.data?.brand?.id))
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Đơn vị tính" htmlFor="unit" required error={errors.unit?.message} hint="Ví dụ: cái, hộp, chai, gói">
              <Input id="unit" invalid={!!errors.unit} {...register("unit")} />
            </FormField>
            <FormField label="Giá bán" htmlFor="sale_price" required error={errors.sale_price?.message}>
              <Controller
                control={control}
                name="sale_price"
                render={({ field }) => (
                  <MoneyInput id="sale_price" invalid={!!errors.sale_price} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                )}
              />
            </FormField>
            <FormField
              label="Tồn tối thiểu"
              htmlFor="min_stock"
              required
              error={errors.min_stock?.message}
              hint="Cảnh báo khi tồn kho ≤ mức này"
            >
              <Input id="min_stock" inputMode="numeric" invalid={!!errors.min_stock} {...register("min_stock")} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Mô tả" htmlFor="description" error={errors.description?.message}>
                <Textarea id="description" rows={3} invalid={!!errors.description} {...register("description")} />
              </FormField>
            </div>
            {isEdit && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 accent-primary" {...register("is_active")} />
                Đang kinh doanh (bỏ chọn để ngừng kinh doanh — sản phẩm không bán và không nhập được nữa)
              </label>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {isEdit && product.data && (
            <Card>
              <CardHeader title="Ảnh sản phẩm" />
              <CardContent>
                <ImageUploader product={product.data} />
              </CardContent>
            </Card>
          )}
          {isEdit && product.data && (
            <Card>
              <CardHeader title="Tồn kho" description="Chỉ đọc — thay đổi qua nhập hàng, bán hàng, trả hàng, điều chỉnh kho" />
              <CardContent className="space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-muted">Tồn hiện tại</span>
                  <span className="tabular font-medium">{formatNumber(product.data.quantity)}</span>
                </p>
                {product.data.avg_cost !== undefined && (
                  <p className="flex justify-between">
                    <span className="text-muted">Giá vốn bình quân</span>
                    <span className="tabular font-medium">{formatMoney(product.data.avg_cost)}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="flex flex-wrap justify-end gap-2">
              <Link to={isEdit ? `/products/${productId}` : "/products"} className={buttonClass({ variant: "outline" })}>
                Hủy
              </Link>
              <Button type="submit" loading={save.isPending} disabled={isEdit && !isDirty}>
                {isEdit ? "Lưu thay đổi" : "Tạo sản phẩm"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </>
  );
}
