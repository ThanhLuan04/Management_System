import { Link } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchInput } from "@/components/common/SearchInput";
import { PageHeader } from "@/components/common/States";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useListParams } from "@/hooks/useListParams";
import { formatDateTime, formatMoney } from "@/utils/format";

import { type OrderSummary, useOrders } from "./api";
import { OrderStatusBadge, PAYMENT_METHOD_LABELS } from "./OrderStatusBadge";

export function OrderListPage() {
  const list = useListParams("-created_at");
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useOrders(list.apiParams);

  const columns: Column<OrderSummary>[] = [
    {
      key: "code",
      header: "Mã đơn",
      sortKey: "code",
      cell: (o) => (
        <Link to={`/orders/${o.id}`} className="tabular font-medium text-primary hover:underline">
          {o.code}
        </Link>
      ),
    },
    { key: "time", header: "Thời gian", sortKey: "created_at", cell: (o) => <span className="tabular whitespace-nowrap">{formatDateTime(o.created_at)}</span> },
    {
      key: "customer",
      header: "Khách hàng",
      cell: (o) =>
        o.customer ? (
          <Link to={`/customers/${o.customer.id}`} className="hover:text-primary hover:underline">
            {o.customer.name}
          </Link>
        ) : (
          <span className="text-muted">Khách lẻ</span>
        ),
    },
    { key: "total", header: "Tổng tiền", sortKey: "total_amount", align: "right", cell: (o) => <span className="tabular">{formatMoney(o.total_amount)}</span> },
    { key: "method", header: "Thanh toán", cell: (o) => (o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : "—") },
    { key: "status", header: "Trạng thái", cell: (o) => <OrderStatusBadge order={o} /> },
    { key: "cashier", header: "Thu ngân", cell: (o) => o.created_by.full_name },
  ];

  return (
    <>
      <PageHeader title="Đơn hàng" />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <SearchInput value={filters.q ?? ""} onSearch={list.setSearch} placeholder="Mã đơn, tên hoặc SĐT khách…" label="Tìm đơn hàng" />
          <Select aria-label="Trạng thái" value={filters.status ?? ""} onChange={(e) => list.setFilter("status", e.target.value || undefined)} className="w-40">
            <option value="">Mọi trạng thái</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="CANCELLED">Đã hủy</option>
          </Select>
          <Select aria-label="Thanh toán" value={filters.payment_method ?? ""} onChange={(e) => list.setFilter("payment_method", e.target.value || undefined)} className="w-40">
            <option value="">Mọi hình thức</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
        </div>
        <DataTable
          caption="Danh sách đơn hàng"
          columns={columns}
          rows={data?.items}
          rowKey={(o) => o.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          sort={list.state.sort}
          onSort={list.setSort}
          emptyTitle={list.hasFilters ? "Không có đơn hàng phù hợp" : "Chưa có đơn hàng"}
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>
    </>
  );
}
