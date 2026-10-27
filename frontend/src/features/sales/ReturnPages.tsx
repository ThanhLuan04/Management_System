import { Link, useParams } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchInput } from "@/components/common/SearchInput";
import { ErrorState, PageHeader } from "@/components/common/States";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { useListParams } from "@/hooks/useListParams";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import { type ReturnSummary, useReturn, useReturns } from "./api";
import { PAYMENT_METHOD_LABELS } from "./OrderStatusBadge";

export function ReturnListPage() {
  const list = useListParams();
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useReturns(list.apiParams);

  const columns: Column<ReturnSummary>[] = [
    {
      key: "code",
      header: "Mã phiếu trả",
      cell: (r) => (
        <Link to={`/returns/${r.id}`} className="tabular font-medium text-primary hover:underline">
          {r.code}
        </Link>
      ),
    },
    {
      key: "order",
      header: "Đơn gốc",
      cell: (r) => (
        <Link to={`/orders/${r.order.id}`} className="tabular hover:text-primary hover:underline">
          {r.order.code}
        </Link>
      ),
    },
    { key: "customer", header: "Khách hàng", cell: (r) => r.customer?.name ?? <span className="text-muted">Khách lẻ</span> },
    { key: "reason", header: "Lý do", className: "min-w-48", cell: (r) => r.reason },
    { key: "refund", header: "Tiền hoàn", align: "right", cell: (r) => <span className="tabular">{formatMoney(r.total_refund)}</span> },
    { key: "method", header: "Hoàn qua", cell: (r) => (r.refund_method ? PAYMENT_METHOD_LABELS[r.refund_method] : "—") },
    { key: "by", header: "Người xử lý", cell: (r) => r.created_by.full_name },
    { key: "time", header: "Thời gian", cell: (r) => <span className="tabular whitespace-nowrap text-muted">{formatDateTime(r.created_at)}</span> },
  ];

  return (
    <>
      <PageHeader title="Trả hàng" description="Tạo phiếu trả từ trang chi tiết đơn hàng." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <SearchInput value={filters.q ?? ""} onSearch={list.setSearch} placeholder="Mã phiếu trả, mã đơn hoặc tên khách…" label="Tìm phiếu trả" />
          <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
        </div>
        <DataTable
          caption="Danh sách phiếu trả hàng"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          emptyTitle={list.hasFilters ? "Không có phiếu trả phù hợp" : "Chưa có phiếu trả hàng"}
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>
    </>
  );
}

export function ReturnDetailPage() {
  const returnId = Number(useParams().id);
  const { data: r, error, isPending, refetch } = useReturn(returnId);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Skeleton className="h-96" />;
  const showCost = r.items.some((i) => i.unit_cost !== undefined);

  return (
    <>
      <PageHeader title={`Phiếu trả ${r.code}`} description={r.reason} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Đơn gốc</dt>
                <dd><Link to={`/orders/${r.order.id}`} className="tabular text-primary hover:underline">{r.order.code}</Link></dd>
              </div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Khách hàng</dt><dd>{r.customer?.name ?? "Khách lẻ"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Người xử lý</dt><dd>{r.created_by.full_name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Thời gian</dt><dd className="tabular">{formatDateTime(r.created_at)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-border pt-2.5">
                <dt className="text-muted">Tiền hoàn{r.refund_method && ` (${PAYMENT_METHOD_LABELS[r.refund_method]})`}</dt>
                <dd className="tabular text-lg font-bold">{formatMoney(r.total_refund)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Sản phẩm trả lại" />
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 font-medium">Tình trạng</th>
                  {showCost && <th className="px-3 py-2 text-right font-medium">Giá vốn</th>}
                  <th className="px-5 py-2 text-right font-medium">Tiền hoàn</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-border">
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-2.5 font-sans">
                      {i.product_name}
                      <span className="block text-xs text-muted">{i.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(i.quantity)}</td>
                    <td className="px-3 py-2.5 font-sans">
                      {i.condition === "RESELLABLE" ? <Badge variant="success">Đã nhập lại kho</Badge> : <Badge variant="warning">Hỏng — không nhập kho</Badge>}
                    </td>
                    {showCost && <td className="px-3 py-2.5 text-right">{formatMoney(i.unit_cost)}</td>}
                    <td className="px-5 py-2.5 text-right font-medium">{formatMoney(i.refund_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
