import { AlertTriangle, LogIn, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { ErrorState, PageHeader } from "@/components/common/States";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormField, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { presetRange } from "@/features/reports/ranges";
import { useListParams } from "@/hooks/useListParams";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatDateTime, formatMoney, formatNumber, toNumber } from "@/utils/format";

import {
  formatMinutes,
  fromLocalInput,
  type TimeEntry,
  toLocalInput,
  useAttendanceEntries,
  useAttendanceSummary,
  useClock,
  useDeleteEntry,
  useMyAttendance,
  useSaveEntry,
  useStaff,
} from "./api";

const TABS = [
  { id: "me", label: "Của tôi" },
  { id: "summary", label: "Bảng công" },
  { id: "entries", label: "Lượt chấm công" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function entryStatus(e: TimeEntry) {
  if (e.forgotten) return <Badge variant="warning" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>Quên ra ca?</Badge>;
  if (!e.clock_out_at) return <Badge variant="info">Đang làm</Badge>;
  return e.note ? <Badge variant="muted">Đã sửa</Badge> : null;
}

// ---------- Của tôi ----------

function MyTab() {
  const me = useMyAttendance();
  const clock = useClock();
  if (me.error) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  if (me.isPending) return <Skeleton className="h-64" />;
  const { current, month, recent } = me.data;

  const run = (action: "clock-in" | "clock-out") =>
    clock.mutate(action, {
      onSuccess: (entry) => toast.success(action === "clock-in" ? "Đã vào ca" : `Đã ra ca — làm ${formatMinutes(entry.minutes)}`),
      onError: (error) => toast.error(toApiError(error).message),
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted">Trạng thái</p>
            <p className="mt-1 text-xl font-semibold">
              {current ? `Đang làm từ ${formatDateTime(current.clock_in_at)}` : "Chưa vào ca"}
            </p>
            {current && <p className="text-sm text-muted">{formatMinutes(current.minutes)}</p>}
          </div>
          {current ? (
            <Button variant="outline" size="lg" loading={clock.isPending} onClick={() => run("clock-out")}>
              <LogOut className="h-5 w-5" aria-hidden /> Ra ca
            </Button>
          ) : (
            <Button size="lg" loading={clock.isPending} onClick={() => run("clock-in")}>
              <LogIn className="h-5 w-5" aria-hidden /> Vào ca
            </Button>
          )}
        </Card>
        <StatCard label="Giờ làm tháng này" value={formatMinutes(month.minutes)} hint="Chỉ tính lượt đã ra ca" />
        <StatCard label="Số lượt" value={formatNumber(month.entry_count)} tone="info" />
        <StatCard label="Lương tạm tính" value={formatMoney(month.pay)} tone="success" hint="Theo lương/giờ lúc vào ca" />
      </div>
      <Card>
        <CardHeader title="Các lượt gần đây" />
        <CardContent className="overflow-x-auto px-0">
          <EntryTable rows={recent} showUser={false} />
        </CardContent>
      </Card>
    </div>
  );
}

function EntryTable({
  rows,
  showUser,
  onEdit,
  onDelete,
}: {
  rows: TimeEntry[];
  showUser: boolean;
  onEdit?: (e: TimeEntry) => void;
  onDelete?: (e: TimeEntry) => void;
}) {
  if (rows.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted">Chưa có lượt chấm công nào.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border bg-surface-hover text-left text-xs font-semibold text-muted">
        <tr>
          {showUser && <th className="px-5 py-2.5">Nhân viên</th>}
          <th className="px-5 py-2.5">Vào ca</th>
          <th className="px-3 py-2.5">Ra ca</th>
          <th className="px-3 py-2.5 text-right">Thời gian</th>
          <th className="px-3 py-2.5 text-right">Tiền công</th>
          <th className="px-3 py-2.5">Ghi chú</th>
          {onEdit && <th className="px-5 py-2.5"><span className="sr-only">Thao tác</span></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((e) => (
          <tr key={e.id} className={cn(e.forgotten && "bg-warning-soft")}>
            {showUser && <td className="px-5 py-2.5 font-medium">{e.user.full_name}</td>}
            <td className="tabular px-5 py-2.5 whitespace-nowrap">{formatDateTime(e.clock_in_at)}</td>
            <td className="tabular px-3 py-2.5 whitespace-nowrap">{e.clock_out_at ? formatDateTime(e.clock_out_at) : "—"}</td>
            <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">{formatMinutes(e.minutes)}</td>
            <td className="tabular px-3 py-2.5 text-right">{e.pay === null ? "—" : formatMoney(e.pay)}</td>
            <td className="px-3 py-2.5">
              <span className="flex flex-wrap items-center gap-2">
                {entryStatus(e)}
                {e.note && <span className="text-xs text-muted" title={e.edited_by ? `Sửa bởi ${e.edited_by.full_name}` : undefined}>{e.note}</span>}
              </span>
            </td>
            {onEdit && onDelete && (
              <td className="px-5 py-2.5 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon" aria-label={`Sửa lượt của ${e.user.full_name}`} onClick={() => onEdit(e)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Xóa lượt của ${e.user.full_name}`} onClick={() => onDelete(e)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- Bảng công ----------

function SummaryTab({ onShowEntries }: { onShowEntries: (userId: number) => void }) {
  const [range, setRange] = useState(() => presetRange("this_month"));
  const { data, error, isPending, isFetching, refetch } = useAttendanceSummary(range);
  const totals = (data ?? []).reduce((s, r) => ({ minutes: s.minutes + r.minutes, pay: s.pay + toNumber(r.pay) }), { minutes: 0, pay: 0 });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <Button variant="outline" size="sm" onClick={() => setRange(presetRange("this_month"))}>Tháng này</Button>
        <Button variant="outline" size="sm" onClick={() => setRange(presetRange("last_month"))}>Tháng trước</Button>
        <DateRangeFilter
          from={range.date_from}
          to={range.date_to}
          onChange={(key, value) => value && setRange((r) => ({ ...r, [key]: value }))}
        />
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="m-5 h-48" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Không có lượt chấm công nào trong kỳ.</p>
      ) : (
        <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
          <table className="w-full text-sm">
            <caption className="sr-only">Bảng công theo nhân viên</caption>
            <thead className="border-b border-border bg-surface-hover text-left text-xs font-semibold text-muted">
              <tr>
                <th className="px-5 py-2.5">Nhân viên</th>
                <th className="px-3 py-2.5 text-right">Lương/giờ</th>
                <th className="px-3 py-2.5 text-right">Số lượt</th>
                <th className="px-3 py-2.5 text-right">Tổng giờ</th>
                <th className="px-3 py-2.5 text-right">Lương tạm tính</th>
                <th className="px-5 py-2.5">Cần kiểm tra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr key={r.user.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-2.5">
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => onShowEntries(r.user.id)}>
                      {r.user.full_name}
                    </button>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{r.hourly_rate ? formatMoney(r.hourly_rate) : <span className="text-muted">Chưa đặt</span>}</td>
                  <td className="tabular px-3 py-2.5 text-right">{formatNumber(r.entry_count)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{formatMinutes(r.minutes)}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{formatMoney(r.pay)}</td>
                  <td className="px-5 py-2.5">
                    {r.forgotten > 0 ? (
                      <Badge variant="warning">{r.forgotten} lượt quên ra ca?</Badge>
                    ) : r.open_entries > 0 ? (
                      <Badge variant="info">Đang làm</Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border font-semibold">
              <tr>
                <td className="px-5 py-2.5" colSpan={3}>Tổng cộng</td>
                <td className="tabular px-3 py-2.5 text-right">{formatMinutes(totals.minutes)}</td>
                <td className="tabular px-3 py-2.5 text-right">{formatMoney(totals.pay)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="px-5 py-3 text-xs text-muted">
            Lượt chưa ra ca không tính tiền. Lương tính theo mức lương/giờ chốt lúc vào ca — đổi mức lương không làm thay đổi các lượt cũ.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------- Lượt chấm công ----------

function EntryDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: TimeEntry | null }) {
  const staff = useStaff(open && !editing);
  const save = useSaveEntry(editing?.id);
  const [userId, setUserId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<TimeEntry | null | undefined>(undefined);

  // Mỗi lần mở hộp thoại: nạp giá trị của lượt đang sửa (hoặc để trống khi thêm mới)
  if (open && openedFor !== editing) {
    setOpenedFor(editing);
    setUserId("");
    setClockIn(editing ? toLocalInput(editing.clock_in_at) : "");
    setClockOut(editing?.clock_out_at ? toLocalInput(editing.clock_out_at) : "");
    setReason("");
    setError(null);
  }
  if (!open && openedFor !== undefined) setOpenedFor(undefined);

  const submit = () => {
    if (!editing && !userId) return setError("Chọn nhân viên");
    if (!clockIn || (!editing && !clockOut)) return setError("Nhập giờ vào và giờ ra");
    if (reason.trim().length < 3) return setError("Ghi lý do (tối thiểu 3 ký tự), vd. Quên bấm ra ca");
    setError(null);
    save.mutate(
      {
        ...(editing ? {} : { user_id: Number(userId) }),
        clock_in_at: fromLocalInput(clockIn),
        clock_out_at: clockOut ? fromLocalInput(clockOut) : null,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success(editing ? "Đã sửa lượt chấm công" : "Đã thêm lượt chấm công");
          onOpenChange(false);
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={editing ? `Sửa lượt của ${editing.user.full_name}` : "Thêm lượt chấm công"}
      description="Dùng khi nhân viên quên bấm vào / ra ca. Mọi thay đổi được ghi vào nhật ký."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Hủy</Button>
          <Button onClick={submit} loading={save.isPending}>Lưu</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <div className="sm:col-span-2">
            <FormField label="Nhân viên" htmlFor="att-user" required>
              <Select id="att-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">— Chọn nhân viên —</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                ))}
              </Select>
            </FormField>
          </div>
        )}
        <FormField label="Giờ vào" htmlFor="att-in" required>
          <Input id="att-in" type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
        </FormField>
        <FormField label="Giờ ra" htmlFor="att-out" required={!editing} hint={editing ? "Để trống = vẫn đang làm" : undefined}>
          <Input id="att-out" type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Lý do" htmlFor="att-reason" required>
            <Input id="att-reason" value={reason} maxLength={255} placeholder="Vd. Quên bấm ra ca" onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </div>
        {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      </div>
    </Dialog>
  );
}

function EntriesTab() {
  const list = useListParams();
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useAttendanceEntries(list.apiParams);
  const [dialog, setDialog] = useState<{ open: boolean; editing: TimeEntry | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const remove = useDeleteEntry();
  const staff = useStaff(true);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <Select aria-label="Nhân viên" value={filters.user_id ?? ""} onChange={(e) => list.setFilter("user_id", e.target.value || undefined)} className="w-56">
          <option value="">Mọi nhân viên</option>
          {staff.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </Select>
        <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
        <Button className="ml-auto" onClick={() => setDialog({ open: true, editing: null })}>
          <Plus className="h-4 w-4" aria-hidden /> Thêm lượt
        </Button>
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="m-5 h-48" />
      ) : (
        <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
          <EntryTable
            rows={data.items}
            showUser
            onEdit={(e) => setDialog({ open: true, editing: e })}
            onDelete={(e) => {
              setDeleteReason("");
              setDeleting(e);
            }}
          />
        </div>
      )}
      {data && data.total > 0 && (
        <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}

      <EntryDialog open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Xóa lượt chấm công của ${deleting?.user.full_name}?`}
        description="Chỉ xóa lượt chấm nhầm. Thao tác được ghi vào nhật ký."
        confirmLabel="Xóa lượt"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          if (deleteReason.trim().length < 3) return toast.error("Ghi lý do xóa (tối thiểu 3 ký tự)");
          remove.mutate(
            { id: deleting.id, reason: deleteReason.trim() },
            {
              onSuccess: () => {
                toast.success("Đã xóa lượt chấm công");
                setDeleting(null);
              },
              onError: (e) => toast.error(toApiError(e).message),
            },
          );
        }}
      >
        <FormField label="Lý do xóa" htmlFor="att-delete-reason" required>
          <Input id="att-delete-reason" value={deleteReason} maxLength={255} onChange={(e) => setDeleteReason(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}

export function AttendancePage() {
  const { can } = useAuth();
  const canManage = can(P.ATTENDANCE_MANAGE);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = canManage ? TABS : TABS.filter((t) => t.id === "me");
  const tab = (tabs.find((t) => t.id === searchParams.get("tab"))?.id ?? "me") as TabId;

  return (
    <>
      <PageHeader title="Chấm công" description="Bấm Vào ca khi bắt đầu làm, Ra ca khi kết thúc. Lương tạm tính theo giờ." />
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Chấm công" className="mb-4 flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setSearchParams({ tab: t.id }, { replace: true })}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === "me" && <MyTab />}
      {tab === "summary" && <SummaryTab onShowEntries={(id) => setSearchParams({ tab: "entries", user_id: String(id) }, { replace: true })} />}
      {tab === "entries" && <EntriesTab />}
    </>
  );
}
