import { Link, useParams } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { ErrorState, PageHeader } from "@/components/common/States";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { useListParams } from "@/hooks/useListParams";
import { formatDateTime, formatMoney } from "@/utils/format";

import { type ShiftSummary as ShiftRow, useShift, useShifts } from "./api";
import { DifferenceBadge, ShiftSummary } from "./components";

/** Lịch sử ca của két chung (Quản lý, Admin): tìm ca lệch tiền để đối soát. */
export function ShiftListPage() {
  const list = useListParams();
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useShifts(list.apiParams);

  const columns: Column<ShiftRow>[] = [
    {
      key: "code",
      header: "Mã ca",
      cell: (s) => (
        <Link to={`/shifts/${s.id}`} className="tabular font-medium text-primary hover:underline">
          {s.code}
        </Link>
      ),
    },
    {
      key: "opened",
      header: "Mở ca",
      cell: (s) => (
        <>
          <span className="tabular block whitespace-nowrap">{formatDateTime(s.opened_at)}</span>
          <span className="text-xs text-muted">{s.opened_by.full_name}</span>
        </>
      ),
    },
    {
      key: "closed",
      header: "Đóng ca",
      cell: (s) =>
        s.closed_at ? (
          <>
            <span className="tabular block whitespace-nowrap">{formatDateTime(s.closed_at)}</span>
            <span className="text-xs text-muted">{s.closed_by?.full_name}</span>
          </>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: "opening", header: "Đầu ca", align: "right", cell: (s) => <span className="tabular">{formatMoney(s.opening_cash)}</span> },
    {
      key: "expected",
      header: "Phải có",
      align: "right",
      cell: (s) => <span className="tabular">{s.expected_cash === null ? "—" : formatMoney(s.expected_cash)}</span>,
    },
    {
      key: "counted",
      header: "Đếm được",
      align: "right",
      cell: (s) => <span className="tabular">{s.counted_cash === null ? "—" : formatMoney(s.counted_cash)}</span>,
    },
    { key: "difference", header: "Chênh lệch", cell: (s) => <DifferenceBadge value={s.difference} /> },
  ];

  return (
    <>
      <PageHeader title="Ca làm việc" description="Két chung: mở ca, bán hàng, đóng ca đếm két. Ca lệch tiền có ghi lý do." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={filters.discrepancy_only === "true"}
              onChange={(e) => list.setFilter("discrepancy_only", e.target.checked ? "true" : undefined)}
            />
            Chỉ ca lệch tiền
          </label>
        </div>
        <DataTable
          caption="Lịch sử ca làm việc"
          columns={columns}
          rows={data?.items}
          rowKey={(s) => s.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          emptyTitle={list.hasFilters ? "Không có ca phù hợp" : "Chưa có ca làm việc"}
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>
    </>
  );
}

export function ShiftDetailPage() {
  const shiftId = Number(useParams().id);
  const { data: shift, error, isPending, refetch } = useShift(shiftId);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        title={`Ca ${shift.code}`}
        description={`Mở lúc ${formatDateTime(shift.opened_at)} bởi ${shift.opened_by.full_name}`}
        actions={<DifferenceBadge value={shift.difference} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tiền trong ca" />
          <CardContent>
            <ShiftSummary shift={shift} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Đóng ca" />
          <CardContent>
            {shift.status === "OPEN" ? (
              <p className="text-sm text-muted">Ca đang mở — thu ngân đóng ca ở màn hình Bán hàng.</p>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Đóng lúc</dt><dd className="tabular">{formatDateTime(shift.closed_at!)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Người đóng</dt><dd>{shift.closed_by?.full_name}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Tiền mặt phải có</dt><dd className="tabular">{formatMoney(shift.expected_cash)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Tiền đếm được</dt><dd className="tabular">{formatMoney(shift.counted_cash)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-border pt-2"><dt className="font-medium">Chênh lệch</dt><dd><DifferenceBadge value={shift.difference} /></dd></div>
                {shift.close_note && (
                  <div className="rounded-md bg-surface-muted p-3">
                    <dt className="text-xs text-muted">Lý do chênh lệch</dt>
                    <dd className="mt-0.5">{shift.close_note}</dd>
                  </div>
                )}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
