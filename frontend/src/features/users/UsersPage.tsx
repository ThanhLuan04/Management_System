import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { SearchInput } from "@/components/common/SearchInput";
import { PageHeader } from "@/components/common/States";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/features/auth/AuthProvider";
import { ActiveBadge } from "@/features/catalog/components";
import { useListParams } from "@/hooks/useListParams";
import { toApiError } from "@/services/apiError";
import { formatDateTime } from "@/utils/format";

import { type UserRow, useCreateUser, useResetPassword, useRoles, useSetUserStatus, useUpdateUser, useUsers } from "./api";
import { passwordSchema } from "./passwordSchema";

const ROLE_VARIANTS = { ADMIN: "destructive", MANAGER: "info", CASHIER: "default" } as const;

const optionalEmail = z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ");
const optionalPhone = z.string().trim().refine((v) => v === "" || /^\+?[0-9][0-9 .-]{7,18}$/.test(v), "Số điện thoại không hợp lệ");

const createSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,50}$/, "3–50 ký tự: chữ không dấu, số, '.', '_', '-'"),
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Tối đa 100 ký tự"),
  password: passwordSchema,
  email: optionalEmail,
  phone: optionalPhone,
  role_id: z.string().min(1, "Vui lòng chọn vai trò"),
});
type CreateValues = z.infer<typeof createSchema>;

const editSchema = createSchema.omit({ username: true, password: true });
type EditValues = z.infer<typeof editSchema>;

function UserDialog({ open, onOpenChange, editing, isSelf }: { open: boolean; onOpenChange: (o: boolean) => void; editing: UserRow | null; isSelf: boolean }) {
  const roles = useRoles();
  const create = useCreateUser();
  const update = useUpdateUser(editing?.id ?? 0);
  const saving = create.isPending || update.isPending;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver((editing ? editSchema : createSchema) as typeof createSchema) });

  useEffect(() => {
    if (open) {
      reset({
        username: editing?.username ?? "",
        full_name: editing?.full_name ?? "",
        password: "",
        email: editing?.email ?? "",
        phone: editing?.phone ?? "",
        role_id: editing ? String(editing.role.id) : "",
      });
    }
  }, [open, editing, reset]);

  const onError = (error: unknown) => {
    const apiError = toApiError(error);
    if (apiError.code === "DUPLICATE_USERNAME") setError("username", { message: apiError.message });
    else if (apiError.code === "DUPLICATE_EMAIL") setError("email", { message: apiError.message });
    else if (Object.keys(apiError.fieldErrors).length)
      Object.entries(apiError.fieldErrors).forEach(([f, message]) => setError(f as keyof CreateValues, { message }));
    else toast.error(apiError.message);
  };

  const onSubmit = (values: CreateValues | EditValues) => {
    const common = {
      full_name: values.full_name,
      email: values.email || null,
      phone: values.phone || null,
      role_id: Number(values.role_id),
    };
    if (editing) {
      update.mutate(isSelf ? { ...common, role_id: undefined } : common, {
        onSuccess: () => {
          toast.success("Đã lưu người dùng");
          onOpenChange(false);
        },
        onError,
      });
    } else {
      const v = values as CreateValues;
      create.mutate(
        { ...common, username: v.username, password: v.password },
        {
          onSuccess: () => {
            toast.success(`Đã tạo tài khoản ${v.username}`);
            onOpenChange(false);
          },
          onError,
        },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={editing ? `Sửa tài khoản ${editing.username}` : "Thêm người dùng"}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            Lưu
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <>
            <FormField label="Tên đăng nhập" htmlFor="u-username" required error={errors.username?.message}>
              <Input id="u-username" autoComplete="off" invalid={!!errors.username} {...register("username")} />
            </FormField>
            <FormField label="Mật khẩu" htmlFor="u-password" required error={errors.password?.message} hint="≥ 8 ký tự, có chữ và số">
              <Input id="u-password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register("password")} />
            </FormField>
          </>
        )}
        <FormField label="Họ tên" htmlFor="u-name" required error={errors.full_name?.message}>
          <Input id="u-name" invalid={!!errors.full_name} {...register("full_name")} />
        </FormField>
        <FormField label="Vai trò" htmlFor="u-role" required error={errors.role_id?.message} hint={isSelf ? "Không thể tự đổi vai trò của mình" : undefined}>
          {isSelf ? (
            // Không dùng <select disabled>: React Hook Form bỏ giá trị của ô bị disable → validate báo thiếu vai trò
            <>
              <Input id="u-role" readOnly value={editing?.role.name ?? ""} />
              <input type="hidden" {...register("role_id")} />
            </>
          ) : (
            <Select id="u-role" invalid={!!errors.role_id} {...register("role_id")}>
              <option value="">— Chọn vai trò —</option>
              {roles.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Email" htmlFor="u-email" error={errors.email?.message}>
          <Input id="u-email" type="email" invalid={!!errors.email} {...register("email")} />
        </FormField>
        <FormField label="Số điện thoại" htmlFor="u-phone" error={errors.phone?.message}>
          <Input id="u-phone" invalid={!!errors.phone} {...register("phone")} />
        </FormField>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const reset = useResetPassword(user?.id ?? 0);
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const check = passwordSchema.safeParse(password);
  const error = tried && !check.success ? check.error.issues[0].message : undefined;

  useEffect(() => {
    setPassword("");
    setTried(false);
  }, [user]);

  return (
    <ConfirmDialog
      open={user !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`Đặt lại mật khẩu cho ${user?.username}?`}
      description="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và mở khóa nếu đang bị khóa tạm do nhập sai nhiều lần."
      confirmLabel="Đặt lại mật khẩu"
      loading={reset.isPending}
      onConfirm={() => {
        setTried(true);
        if (!check.success) return;
        reset.mutate(password, {
          onSuccess: () => {
            toast.success("Đã đặt lại mật khẩu. Hãy gửi mật khẩu mới cho người dùng qua kênh an toàn.");
            onClose();
          },
          onError: (e) => toast.error(toApiError(e).message),
        });
      }}
    >
      <FormField label="Mật khẩu mới" htmlFor="reset-password" required error={error} hint="≥ 8 ký tự, có chữ và số">
        <Input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} />
      </FormField>
    </ConfirmDialog>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const list = useListParams("-created_at");
  const { filters } = list.state;
  const roles = useRoles();
  const { data, error, isPending, isFetching, refetch } = useUsers(list.apiParams);
  const [dialog, setDialog] = useState<{ open: boolean; editing: UserRow | null }>({ open: false, editing: null });
  const [toggling, setToggling] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const setStatus = useSetUserStatus(toggling?.id ?? 0);

  const columns: Column<UserRow>[] = [
    {
      key: "username",
      header: "Tài khoản",
      sortKey: "username",
      cell: (u) => (
        <>
          <span className="font-medium">{u.username}</span>
          {u.id === me?.id && <span className="ml-2 text-xs text-muted">(bạn)</span>}
        </>
      ),
    },
    { key: "name", header: "Họ tên", sortKey: "full_name", cell: (u) => u.full_name },
    { key: "role", header: "Vai trò", cell: (u) => <Badge variant={ROLE_VARIANTS[u.role.code]}>{u.role.name}</Badge> },
    { key: "contact", header: "Liên hệ", cell: (u) => <span className="text-muted">{[u.email, u.phone].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "status", header: "Trạng thái", cell: (u) => <ActiveBadge active={u.is_active} activeLabel="Hoạt động" inactiveLabel="Đã khóa" /> },
    { key: "login", header: "Đăng nhập gần nhất", sortKey: "last_login_at", cell: (u) => <span className="tabular text-muted">{u.last_login_at ? formatDateTime(u.last_login_at) : "Chưa đăng nhập"}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (u) => (
        <span className="flex justify-end gap-3 text-sm whitespace-nowrap">
          <button type="button" className="text-primary hover:underline" onClick={() => setDialog({ open: true, editing: u })}>
            Sửa
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-foreground hover:underline" onClick={() => setResetting(u)}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden /> Mật khẩu
          </button>
          <button
            type="button"
            className="text-muted hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
            disabled={u.id === me?.id}
            title={u.id === me?.id ? "Không thể tự khóa tài khoản của mình" : undefined}
            onClick={() => setToggling(u)}
          >
            {u.is_active ? "Khóa" : "Mở khóa"}
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Quyền được kiểm tra ở máy chủ cho mọi thao tác; đổi vai trò hoặc khóa tài khoản có hiệu lực ngay."
        actions={
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4" aria-hidden /> Thêm người dùng
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <SearchInput value={filters.q ?? ""} onSearch={list.setSearch} placeholder="Tài khoản, họ tên, email…" label="Tìm người dùng" />
          <Select aria-label="Vai trò" value={filters.role ?? ""} onChange={(e) => list.setFilter("role", e.target.value || undefined)} className="w-44">
            <option value="">Mọi vai trò</option>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.code}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Trạng thái" value={filters.is_active ?? ""} onChange={(e) => list.setFilter("is_active", e.target.value || undefined)} className="w-40">
            <option value="">Mọi trạng thái</option>
            <option value="true">Hoạt động</option>
            <option value="false">Đã khóa</option>
          </Select>
        </div>
        <DataTable
          caption="Danh sách người dùng"
          columns={columns}
          rows={data?.items}
          rowKey={(u) => u.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          sort={list.state.sort}
          onSort={list.setSort}
          emptyTitle="Không có người dùng phù hợp"
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>

      <UserDialog
        key={dialog.editing?.id ?? "new"} // schema thêm/sửa khác nhau → tạo lại form khi đổi chế độ
        open={dialog.open}
        editing={dialog.editing}
        isSelf={dialog.editing?.id === me?.id}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.is_active ? `Khóa tài khoản ${toggling.username}?` : `Mở khóa tài khoản ${toggling?.username}?`}
        description={
          toggling?.is_active
            ? "Người dùng bị đăng xuất ngay trên mọi thiết bị và không đăng nhập được nữa. Lịch sử thao tác vẫn được giữ."
            : "Người dùng có thể đăng nhập lại."
        }
        confirmLabel={toggling?.is_active ? "Khóa tài khoản" : "Mở khóa"}
        destructive={toggling?.is_active}
        loading={setStatus.isPending}
        onConfirm={() =>
          toggling &&
          setStatus.mutate(!toggling.is_active, {
            onSuccess: () => {
              toast.success("Đã cập nhật trạng thái tài khoản");
              setToggling(null);
            },
            onError: (e) => toast.error(toApiError(e).message),
          })
        }
      />
    </>
  );
}
