import { Plus } from "lucide-react";
import { Link } from "react-router";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchInput } from "@/components/common/SearchInput";
import { PageHeader } from "@/components/common/States";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSupplierOptions } from "@/features/partners/api";
import { useListParams } from "@/hooks/useListParams";
import { formatDateTime, formatMoney } from "@/utils/format";

import { type PurchaseSummary, usePurchases } from "./api";
import { PURCHASE_STATUS_OPTIONS, PurchaseStatusBadge } from "./PurchaseStatusBadge";

export function PurchaseListPage() {
  const list = useListParams("-created_at");
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = usePurchases(list.apiParams);
  const suppliers = useSupplierOptions();

  const columns: Column<PurchaseSummary>[] = [
    {
      key: "code",
      header: "Mã phiếu",
      sortKey: "code",
      cell: (p) => (
        <Link to={`/purchases/${p.id}`} className="tabular font-medium text-primary hover:underline">
          {p.code}
        </Link>
      ),
    },
    { key: "supplier", header: "Nhà cung cấp", className: "min-w-48", cell: (p) => p.supplier.name },
    { key: "items", header: "Mặt hàng", align: "right", cell: (p) => <span className="tabular">{p.item_count}</span> },
    { key: "total", header: "Tổng tiền", sortKey: "total_amount", align: "right", cell: (p) => <span className="tabular">{formatMoney(p.total_amount)}</span> },
    { key: "status", header: "Trạng thái", cell: (p) => <PurchaseStatusBadge status={p.status} /> },
    { key: "creator", header: "Người tạo", cell: (p) => p.created_by.full_name },
    { key: "created", header: "Ngày tạo", sortKey: "created_at", cell: (p) => <span className="tabular whitespace-nowrap text-muted">{formatDateTime(p.created_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Nhập hàng"
        description="Phiếu nháp chưa làm thay đổi tồn kho. Tồn kho chỉ được cộng khi xác nhận nhập kho."
        actions={
          <Link to="/purchases/new" className={buttonClass()}>
            <Plus className="h-4 w-4" aria-hidden /> Tạo phiếu nhập
          </Link>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <SearchInput value={filters.q ?? ""} onSearch={list.setSearch} placeholder="Mã phiếu…" label="Tìm phiếu nhập" className="max-w-xs" />
          <Select aria-label="Nhà cung cấp" value={filters.supplier_id ?? ""} onChange={(e) => list.setFilter("supplier_id", e.target.value || undefined)} className="w-56">
            <option value="">Mọi nhà cung cấp</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Trạng thái" value={filters.status ?? ""} onChange={(e) => list.setFilter("status", e.target.value || undefined)} className="w-40">
            <option value="">Mọi trạng thái</option>
            {PURCHASE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
        </div>
        <DataTable
          caption="Danh sách phiếu nhập"
          columns={columns}
          rows={data?.items}
          rowKey={(p) => p.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          sort={list.state.sort}
          onSort={list.setSort}
          emptyTitle={list.hasFilters ? "Không có phiếu nhập phù hợp" : "Chưa có phiếu nhập"}
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>
    </>
  );
}
