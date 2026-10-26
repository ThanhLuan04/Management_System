import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Select, Textarea } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

import { type Brand, type Category, useBrands, useCategoryTree, useSaveBrand, useSaveCategory } from "./api";
import { ActiveBadge } from "./components";

// ---------- Danh mục ----------

const categorySchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên danh mục").max(100, "Tối đa 100 ký tự"),
  parent_id: z.string(),
  description: z.string().max(2000, "Tối đa 2000 ký tự"),
});
type CategoryForm = z.infer<typeof categorySchema>;

function CategoryDialog({
  open,
  onOpenChange,
  editing,
  roots,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Category | null;
  roots: Category[];
}) {
  const save = useSaveCategory(editing?.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CategoryForm>({ resolver: zodResolver(categorySchema) });

  useEffect(() => {
    if (open) {
      reset({
        name: editing?.name ?? "",
        parent_id: editing?.parent_id ? String(editing.parent_id) : "",
        description: editing?.description ?? "",
      });
    }
  }, [open, editing, reset]);

  const onSubmit = (values: CategoryForm) =>
    save.mutate(
      { name: values.name, parent_id: values.parent_id ? Number(values.parent_id) : null, description: values.description || null },
      {
        onSuccess: () => {
          toast.success(editing ? "Đã lưu danh mục" : "Đã tạo danh mục");
          onOpenChange(false);
        },
        onError: (error) => {
          const apiError = toApiError(error);
          if (apiError.code === "DUPLICATE_CATEGORY") setError("name", { message: apiError.message });
          else if (apiError.fieldErrors.parent_id) setError("parent_id", { message: apiError.fieldErrors.parent_id });
          else toast.error(apiError.message);
        },
      },
    );

  // Danh mục chỉ 2 cấp: cha phải là danh mục gốc và không phải chính nó
  const parentOptions = roots.filter((r) => r.is_active && r.id !== editing?.id);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Sửa danh mục" : "Thêm danh mục"}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="category-form" loading={save.isPending}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormField label="Tên danh mục" htmlFor="category-name" required error={errors.name?.message}>
          <Input id="category-name" autoFocus invalid={!!errors.name} {...register("name")} />
        </FormField>
        <FormField label="Danh mục cha" htmlFor="category-parent" error={errors.parent_id?.message} hint="Tối đa 2 cấp">
          <Select id="category-parent" invalid={!!errors.parent_id} {...register("parent_id")}>
            <option value="">— Không có (danh mục gốc) —</option>
            {parentOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Mô tả" htmlFor="category-description" error={errors.description?.message}>
          <Textarea id="category-description" rows={2} {...register("description")} />
        </FormField>
      </form>
    </Dialog>
  );
}

// ---------- Thương hiệu ----------

const brandSchema = z.object({ name: z.string().trim().min(1, "Vui lòng nhập tên thương hiệu").max(100, "Tối đa 100 ký tự") });

function BrandDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Brand | null }) {
  const save = useSaveBrand(editing?.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<{ name: string }>({ resolver: zodResolver(brandSchema) });

  useEffect(() => {
    if (open) reset({ name: editing?.name ?? "" });
  }, [open, editing, reset]);

  const onSubmit = (values: { name: string }) =>
    save.mutate(values, {
      onSuccess: () => {
        toast.success(editing ? "Đã lưu thương hiệu" : "Đã tạo thương hiệu");
        onOpenChange(false);
      },
      onError: (error) => {
        const apiError = toApiError(error);
        if (apiError.code === "DUPLICATE_BRAND") setError("name", { message: apiError.message });
        else toast.error(apiError.message);
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Sửa thương hiệu" : "Thêm thương hiệu"}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="brand-form" loading={save.isPending}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="brand-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField label="Tên thương hiệu" htmlFor="brand-name" required error={errors.name?.message}>
          <Input id="brand-name" autoFocus invalid={!!errors.name} {...register("name")} />
        </FormField>
      </form>
    </Dialog>
  );
}

// ---------- Trang ----------

type ToggleTarget = { kind: "category"; item: Category } | { kind: "brand"; item: Brand };

export function CategoriesPage() {
  const { can } = useAuth();
  const canManage = can(P.CATALOG_MANAGE);
  const tree = useCategoryTree();
  const brands = useBrands();
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null });
  const [brandDialog, setBrandDialog] = useState<{ open: boolean; editing: Brand | null }>({ open: false, editing: null });
  const [toggle, setToggle] = useState<ToggleTarget | null>(null);
  const toggleCategory = useSaveCategory(toggle?.kind === "category" ? toggle.item.id : undefined);
  const toggleBrand = useSaveBrand(toggle?.kind === "brand" ? toggle.item.id : undefined);

  const confirmToggle = () => {
    if (!toggle) return;
    const mutation = toggle.kind === "category" ? toggleCategory : toggleBrand;
    mutation.mutate(
      { is_active: !toggle.item.is_active },
      {
        onSuccess: () => {
          toast.success(toggle.item.is_active ? "Đã ngừng sử dụng" : "Đã sử dụng lại");
          setToggle(null);
        },
        onError: (error) => toast.error(toApiError(error).message), // vd. "Danh mục còn sản phẩm đang kinh doanh"
      },
    );
  };

  const roots = tree.data ?? [];
  const rows = roots.flatMap((root) => [{ ...root, depth: 0 }, ...root.children.map((c) => ({ ...c, depth: 1 }))]);

  const actionButtons = (onEdit: () => void, onToggle: () => void, active: boolean) =>
    canManage && (
      <span className="flex justify-end gap-3 text-sm">
        <button type="button" className="text-primary hover:underline" onClick={onEdit}>
          Sửa
        </button>
        <button type="button" className="text-muted hover:text-foreground hover:underline" onClick={onToggle}>
          {active ? "Ngừng dùng" : "Dùng lại"}
        </button>
      </span>
    );

  return (
    <>
      <PageHeader title="Danh mục & thương hiệu" description="Danh mục tối đa 2 cấp. Không xóa — chỉ ngừng sử dụng." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Danh mục"
            actions={
              canManage && (
                <Button size="sm" onClick={() => setCategoryDialog({ open: true, editing: null })}>
                  <Plus className="h-4 w-4" aria-hidden /> Thêm danh mục
                </Button>
              )
            }
          />
          <CardContent className="px-0">
            {tree.error ? (
              <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
            ) : tree.isPending ? (
              <Skeleton className="mx-5 h-48" />
            ) : rows.length === 0 ? (
              <EmptyState title="Chưa có danh mục" />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2 font-medium">Tên danh mục</th>
                    <th className="px-3 py-2 text-right font-medium">Sản phẩm đang bán</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-5 py-2"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className={cn("px-5 py-2.5", row.depth === 0 ? "font-medium" : "pl-10 text-slate-700")}>
                        {row.depth === 1 && <span className="mr-1 text-slate-300" aria-hidden>└</span>}
                        {row.name}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">
                        <Link to={`/products?category_id=${row.id}`} className="hover:text-primary hover:underline">
                          {formatNumber(row.product_count)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <ActiveBadge active={row.is_active} activeLabel="Đang dùng" inactiveLabel="Ngừng dùng" />
                      </td>
                      <td className="px-5 py-2.5">
                        {actionButtons(
                          () => setCategoryDialog({ open: true, editing: row }),
                          () => setToggle({ kind: "category", item: row }),
                          row.is_active,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Thương hiệu"
            actions={
              canManage && (
                <Button size="sm" variant="outline" onClick={() => setBrandDialog({ open: true, editing: null })}>
                  <Plus className="h-4 w-4" aria-hidden /> Thêm
                </Button>
              )
            }
          />
          <CardContent className="px-0">
            {brands.error ? (
              <ErrorState error={brands.error} onRetry={() => brands.refetch()} />
            ) : brands.isPending ? (
              <Skeleton className="mx-5 h-48" />
            ) : brands.data.length === 0 ? (
              <EmptyState title="Chưa có thương hiệu" />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {brands.data.map((brand) => (
                  <li key={brand.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className={cn(!brand.is_active && "text-muted line-through")}>{brand.name}</span>
                    {actionButtons(
                      () => setBrandDialog({ open: true, editing: brand }),
                      () => setToggle({ kind: "brand", item: brand }),
                      brand.is_active,
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <CategoryDialog
        open={categoryDialog.open}
        editing={categoryDialog.editing}
        roots={roots}
        onOpenChange={(open) => setCategoryDialog((s) => ({ ...s, open }))}
      />
      <BrandDialog
        open={brandDialog.open}
        editing={brandDialog.editing}
        onOpenChange={(open) => setBrandDialog((s) => ({ ...s, open }))}
      />
      <ConfirmDialog
        open={toggle !== null}
        onOpenChange={(open) => !open && setToggle(null)}
        title={toggle?.item.is_active ? `Ngừng sử dụng "${toggle.item.name}"?` : `Sử dụng lại "${toggle?.item.name}"?`}
        description={
          toggle?.item.is_active
            ? "Sẽ không chọn được khi thêm sản phẩm mới. Sản phẩm và lịch sử hiện có không bị ảnh hưởng."
            : "Sẽ chọn được lại khi thêm hoặc sửa sản phẩm."
        }
        confirmLabel={toggle?.item.is_active ? "Ngừng sử dụng" : "Sử dụng lại"}
        destructive={toggle?.item.is_active}
        loading={toggleCategory.isPending || toggleBrand.isPending}
        onConfirm={confirmToggle}
      />
    </>
  );
}
