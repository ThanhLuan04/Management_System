import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { SearchInput } from "@/components/common/SearchInput";
import { PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useListParams } from "@/hooks/useListParams";
import { formatDate, formatMoney, formatNumber } from "@/utils/format";

import { type Customer, useCustomers } from "./api";
import { CustomerDialog } from "./CustomerDialog";

export function CustomersPage() {
  const list = useListParams("-created_at");
  const { data, error, isPending, isFetching, refetch } = useCustomers(list.apiParams);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Customer | null }>({ open: false, editing: null });

  const columns: Column<Customer>[] = [
    { key: "code", header: "Mã", sortKey: "code", cell: (c) => <span className="tabular font-medium">{c.code}</span> },
    {
      key: "name",
      header: "Khách hàng",
      sortKey: "name",
      className: "min-w-48",
      cell: (c) => (
        <Link to={`/customers/${c.id}`} className="font-medium hover:text-primary hover:underline">
          {c.name}
        </Link>
      ),
    },
    { key: "phone", header: "Điện thoại", cell: (c) => <span className="tabular">{c.phone ?? "—"}</span> },
    { key: "orders", header: "Số đơn", align: "right", cell: (c) => <span className="tabular">{formatNumber(c.order_count)}</span> },
    { key: "spent", header: "Tổng chi tiêu", align: "right", cell: (c) => <span className="tabular">{formatMoney(c.total_spent)}</span> },
    { key: "created", header: "Ngày tạo", sortKey: "created_at", cell: (c) => <span className="tabular text-muted">{formatDate(c.created_at)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (c) => (
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => setDialog({ open: true, editing: c })}>
          Sửa
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Khách hàng"
        description="Tổng chi tiêu đã trừ tiền hoàn trả; không tính đơn đã hủy."
        actions={
          <Button onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="h-4 w-4" aria-hidden /> Thêm khách hàng
          </Button>
        }
      />
      <Card>
        <div className="border-b border-border p-4">
          <SearchInput
            value={list.state.filters.q ?? ""}
            onSearch={list.setSearch}
            placeholder="Tìm theo tên, mã hoặc số điện thoại…"
            label="Tìm khách hàng"
            className="max-w-md"
          />
        </div>
        <DataTable
          caption="Danh sách khách hàng"
          columns={columns}
          rows={data?.items}
          rowKey={(c) => c.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          sort={list.state.sort}
          onSort={list.setSort}
          emptyTitle={list.hasFilters ? "Không tìm thấy khách hàng" : "Chưa có khách hàng"}
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>
      <CustomerDialog open={dialog.open} editing={dialog.editing} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  );
}
