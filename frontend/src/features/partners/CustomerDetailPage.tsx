import { Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { ErrorState, PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import type { OrderSummary } from "@/features/dashboard/api";
import { OrderStatusBadge, PAYMENT_METHOD_LABELS } from "@/features/sales/OrderStatusBadge";
import { useListParams } from "@/hooks/useListParams";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import { useCustomer, useCustomerOrders } from "./api";
import { CustomerDialog } from "./CustomerDialog";

export function CustomerDetailPage() {
  const customerId = Number(useParams().id);
  const customer = useCustomer(customerId);
  const list = useListParams("-created_at");
  const orders = useCustomerOrders(customerId, list.apiParams);
  const [editing, setEditing] = useState(false);

  if (customer.error) return <ErrorState error={customer.error} onRetry={() => customer.refetch()} />;
  if (customer.isPending) return <Skeleton className="h-96" />;
  const c = customer.data;

  const columns: Column<OrderSummary>[] = [
    {
      key: "code",
      header: "Mã đơn",
      cell: (o) => (
        <Link to={`/orders/${o.id}`} className="font-medium text-primary hover:underline">
          {o.code}
        </Link>
      ),
    },
    { key: "time", header: "Thời gian", sortKey: "created_at", cell: (o) => <span className="tabular">{formatDateTime(o.created_at)}</span> },
    { key: "items", header: "Số mặt hàng", align: "right", cell: (o) => <span className="tabular">{o.item_count}</span> },
    { key: "total", header: "Tổng tiền", sortKey: "total_amount", align: "right", cell: (o) => <span className="tabular">{formatMoney(o.total_amount)}</span> },
    { key: "method", header: "Thanh toán", cell: (o) => (o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : "—") },
    { key: "status", header: "Trạng thái", cell: (o) => <OrderStatusBadge order={o} /> },
  ];

  return (
    <>
      <PageHeader
        title={c.name}
        description={`${c.code}${c.phone ? ` · ${c.phone}` : ""}`}
        actions={
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Sửa thông tin
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted">Số đơn hợp lệ</p>
                <p className="text-2xl font-bold">{formatNumber(c.order_count)}</p>
              </div>
              <div>
                <p className="text-muted">Tổng chi tiêu</p>
                <p className="text-2xl font-bold">{formatMoney(c.total_spent)}</p>
              </div>
            </div>
            <dl className="space-y-2 border-t border-border pt-4">
              <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd>{c.email ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Địa chỉ</dt><dd className="text-right">{c.address ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Ngày tạo</dt><dd className="tabular">{formatDate(c.created_at)}</dd></div>
            </dl>
            {c.note && <p className="border-t border-border pt-4 whitespace-pre-line text-muted">{c.note}</p>}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Lịch sử mua hàng" />
          <CardContent className="px-0 pb-0">
            <DataTable
              caption="Lịch sử mua hàng"
              columns={columns}
              rows={orders.data?.items}
              rowKey={(o) => o.id}
              isPending={orders.isPending}
              isFetching={orders.isFetching}
              error={orders.error}
              onRetry={() => orders.refetch()}
              sort={list.state.sort}
              onSort={list.setSort}
              emptyTitle="Khách hàng chưa mua đơn nào"
            />
            {orders.data && orders.data.total > 0 && (
              <Pagination
                page={orders.data.page}
                pageSize={orders.data.page_size}
                total={orders.data.total}
                onPageChange={list.setPage}
                onPageSizeChange={list.setPageSize}
              />
            )}
          </CardContent>
        </Card>
      </div>
      <CustomerDialog open={editing} onOpenChange={setEditing} editing={c} />
    </>
  );
}
