import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { SearchInput } from "@/components/common/SearchInput";
import { PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Select, Textarea } from "@/components/ui/Select";
import { ActiveBadge } from "@/features/catalog/components";
import { useListParams } from "@/hooks/useListParams";
import { toApiError } from "@/services/apiError";

import { type Supplier, useSaveSupplier, useSuppliers } from "./api";

const schema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nhà cung cấp").max(255, "Tối đa 255 ký tự"),
  contact_name: z.string().trim().max(100, "Tối đa 100 ký tự"),
  phone: z.string().trim().refine((v) => v === "" || /^\+?[0-9][0-9 .-]{7,18}$/.test(v), "Số điện thoại không hợp lệ"),
  email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ"),
  tax_code: z.string().trim().refine((v) => v === "" || /^[0-9-]{10,14}$/.test(v), "Mã số thuế gồm 10–14 chữ số"),
  address: z.string().trim().max(500, "Tối đa 500 ký tự"),
  note: z.string().max(2000, "Tối đa 2000 ký tự"),
});
type FormValues = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape) as (keyof FormValues)[];

function SupplierDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: Supplier | null }) {
  const save = useSaveSupplier(editing?.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset(Object.fromEntries(FIELDS.map((f) => [f, editing?.[f] ?? ""])) as FormValues);
  }, [open, editing, reset]);

  const onSubmit = (values: FormValues) =>
    // Gửi chuỗi rỗng → backend lưu null (xóa giá trị)
    save.mutate(values, {
      onSuccess: (saved) => {
        toast.success(editing ? "Đã lưu nhà cung cấp" : `Đã tạo nhà cung cấp ${saved.code}`);
        onOpenChange(false);
      },
      onError: (error) => {
        const apiError = toApiError(error);
        const fieldErrors = Object.entries(apiError.fieldErrors).filter(([f]) => FIELDS.includes(f as keyof FormValues));
        if (fieldErrors.length) fieldErrors.forEach(([f, message]) => setError(f as keyof FormValues, { message }));
        else toast.error(apiError.message);
      },
    });

  const field = (name: keyof FormValues, label: string, required = false) => (
    <FormField label={label} htmlFor={`supplier-${name}`} required={required} error={errors[name]?.message}>
      <Input id={`supplier-${name}`} invalid={!!errors[name]} {...register(name)} />
    </FormField>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Sửa nhà cung cấp ${editing.code}` : "Thêm nhà cung cấp"}
      description={editing ? undefined : "Mã nhà cung cấp do hệ thống tự sinh."}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="supplier-form" loading={save.isPending}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{field("name", "Tên nhà cung cấp", true)}</div>
        {field("contact_name", "Người liên hệ")}
        {field("phone", "Số điện thoại")}
        {field("email", "Email")}
        {field("tax_code", "Mã số thuế")}
        <div className="sm:col-span-2">{field("address", "Địa chỉ")}</div>
        <div className="sm:col-span-2">
          <FormField label="Ghi chú" htmlFor="supplier-note" error={errors.note?.message}>
            <Textarea id="supplier-note" rows={2} {...register("note")} />
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}

export function SuppliersPage() {
  const list = useListParams("code");
  const { data, error, isPending, isFetching, refetch } = useSuppliers(list.apiParams);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Supplier | null }>({ open: false, editing: null });
  const [toggling, setToggling] = useState<Supplier | null>(null);
  const toggle = useSaveSupplier(toggling?.id);

  const columns: Column<Supplier>[] = [
    { key: "code", header: "Mã", sortKey: "code", cell: (s) => <span className="tabular font-medium">{s.code}</span> },
    {
      key: "name",
      header: "Nhà cung cấp",
      sortKey: "name",
      className: "min-w-56",
      cell: (s) => (
        <>
          <span className="font-medium">{s.name}</span>
          {s.address && <span className="block text-xs text-muted">{s.address}</span>}
        </>
      ),
    },
    { key: "contact", header: "Người liên hệ", cell: (s) => s.contact_name ?? "—" },
    { key: "phone", header: "Điện thoại", cell: (s) => <span className="tabular">{s.phone ?? "—"}</span> },
    { key: "status", header: "Trạng thái", cell: (s) => <ActiveBadge active={s.is_active} activeLabel="Đang hợp tác" inactiveLabel="Ngừng hợp tác" /> },
    {
      key: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (s) => (
        <span className="flex justify-end gap-3 text-sm">
          <button type="button" className="text-primary hover:underline" onClick={() => setDialog({ open: true, editing: s })}>
            Sửa
          </button>
          <button type="button" className="text-muted hover:text-foreground hover:underline" onClick={() => setToggling(s)}>
            {s.is_active ? "Ngừng" : "Hợp tác lại"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        actions={
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4" aria-hidden /> Thêm nhà cung cấp
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <SearchInput
            value={list.state.filters.q ?? ""}
            onSearch={list.setSearch}
            placeholder="Tìm theo mã, tên, người liên hệ, SĐT…"
            label="Tìm nhà cung cấp"
          />
          <Select
            aria-label="Lọc theo trạng thái"
            value={list.state.filters.is_active ?? ""}
            onChange={(e) => list.setFilter("is_active", e.target.value || undefined)}
            className="w-48"
          >
            <option value="">Mọi trạng thái</option>
            <option value="true">Đang hợp tác</option>
            <option value="false">Ngừng hợp tác</option>
          </Select>
        </div>
        <DataTable
          caption="Danh sách nhà cung cấp"
          columns={columns}
          rows={data?.items}
          rowKey={(s) => s.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          sort={list.state.sort}
          onSort={list.setSort}
          emptyTitle={list.hasFilters ? "Không có nhà cung cấp phù hợp" : "Chưa có nhà cung cấp"}
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>

      <SupplierDialog open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && setToggling(null)}
        title={toggling?.is_active ? `Ngừng hợp tác với ${toggling.name}?` : `Hợp tác lại với ${toggling?.name}?`}
        description={
          toggling?.is_active
            ? "Không tạo được phiếu nhập mới với nhà cung cấp này. Phiếu nhập cũ vẫn được giữ nguyên."
            : "Có thể tạo phiếu nhập với nhà cung cấp này trở lại."
        }
        confirmLabel={toggling?.is_active ? "Ngừng hợp tác" : "Hợp tác lại"}
        destructive={toggling?.is_active}
        loading={toggle.isPending}
        onConfirm={() =>
          toggling &&
          toggle.mutate(
            { is_active: !toggling.is_active },
            {
              onSuccess: () => {
                toast.success("Đã cập nhật trạng thái nhà cung cấp");
                setToggling(null);
              },
              onError: (e) => toast.error(toApiError(e).message),
            },
          )
        }
      />
    </>
  );
}
