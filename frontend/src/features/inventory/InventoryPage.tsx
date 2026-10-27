import { ClipboardCheck, Download, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SearchInput } from "@/components/common/SearchInput";
import { PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { flattenCategories, useCategoryTree } from "@/features/catalog/api";
import { StockCell, TRANSACTION_LABELS } from "@/features/catalog/components";
import { useListParams } from "@/hooks/useListParams";
import { toApiError } from "@/services/apiError";
import { downloadFile } from "@/services/download";
import { cn } from "@/utils/cn";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import { type AdjustmentSummary, type InventoryItem, type LedgerEntry, referenceLink, useAdjustments, useInventory, useLedger } from "./api";

const TABS = [
  { id: "stock", label: "Tồn kho" },
  { id: "history", label: "Lịch sử kho" },
  { id: "adjustments", label: "Phiếu điều chỉnh" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function StockTab() {
  const { can } = useAuth();
  const list = useListParams("name");
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useInventory(list.apiParams);
  const { data: tree } = useCategoryTree();
  const [exporting, setExporting] = useState(false);
  const showCost = can(P.COST_VIEW);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile("/reports/inventory", { format: "csv", low_stock: filters.low_stock === "true" }, "ton-kho.csv");
    } catch (error) {
      toast.error(toApiError(error).message);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<InventoryItem>[] = [
    { key: "sku", header: "SKU", sortKey: "sku", cell: (i) => <span className="tabular font-medium">{i.sku}</span> },
    {
      key: "name",
      header: "Sản phẩm",
      sortKey: "name",
      className: "min-w-56",
      cell: (i) => (
        <Link to={`/products/${i.product_id}`} className="hover:text-primary hover:underline">
          {i.name}
          <span className="block text-xs text-muted">{i.category_name}{!i.is_active && " · ngừng kinh doanh"}</span>
        </Link>
      ),
    },
    { key: "qty", header: "Tồn", sortKey: "quantity", align: "right", cell: (i) => <StockCell quantity={i.quantity} isLow={i.is_low_stock} /> },
    { key: "min", header: "Tối thiểu", align: "right", cell: (i) => <span className="tabular text-muted">{formatNumber(i.min_stock)}</span> },
    ...(showCost
      ? [
          { key: "cost", header: "Giá vốn BQ", align: "right" as const, cell: (i: InventoryItem) => <span className="tabular">{formatMoney(i.avg_cost)}</span> },
          {
            key: "value",
            header: "Giá trị tồn",
            sortKey: "stock_value",
            align: "right" as const,
            cell: (i: InventoryItem) => <span className="tabular font-medium">{formatMoney(i.stock_value)}</span>,
          },
        ]
      : []),
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <SearchInput value={filters.q ?? ""} onSearch={list.setSearch} placeholder="Tên, SKU hoặc mã vạch…" label="Tìm sản phẩm" />
        <Select aria-label="Danh mục" value={filters.category_id ?? ""} onChange={(e) => list.setFilter("category_id", e.target.value || undefined)} className="w-52">
          <option value="">Tất cả danh mục</option>
          {flattenCategories(tree).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Tình trạng tồn"
          value={filters.low_stock === "true" ? "low" : filters.out_of_stock === "true" ? "out" : ""}
          onChange={(e) => {
            list.setFilter("low_stock", e.target.value === "low" ? "true" : undefined);
            list.setFilter("out_of_stock", e.target.value === "out" ? "true" : undefined);
          }}
          className="w-44"
        >
          <option value="">Mọi tình trạng</option>
          <option value="low">Sắp hết hàng</option>
          <option value="out">Hết hàng</option>
        </Select>
        {can(P.REPORTS_VIEW) && (
          <Button variant="outline" onClick={exportCsv} loading={exporting}>
            <Download className="h-4 w-4" aria-hidden /> Xuất CSV
          </Button>
        )}
      </div>
      <DataTable
        caption="Tồn kho theo sản phẩm"
        columns={columns}
        rows={data?.items}
        rowKey={(i) => i.product_id}
        isPending={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        sort={list.state.sort}
        onSort={list.setSort}
        emptyTitle="Không có sản phẩm phù hợp"
      />
      {data && data.total > 0 && (
        <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </Card>
  );
}

function HistoryTab() {
  const { can } = useAuth();
  const list = useListParams();
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useLedger(list.apiParams);

  const columns: Column<LedgerEntry>[] = [
    { key: "time", header: "Thời gian", cell: (t) => <span className="tabular whitespace-nowrap text-muted">{formatDateTime(t.created_at)}</span> },
    {
      key: "product",
      header: "Sản phẩm",
      className: "min-w-48",
      cell: (t) => (
        <button type="button" className="text-left hover:text-primary hover:underline" onClick={() => list.setFilter("product_id", String(t.product_id))} title="Lọc theo sản phẩm này">
          {t.product_name}
          <span className="tabular block text-xs text-muted">{t.sku}</span>
        </button>
      ),
    },
    { key: "type", header: "Loại", cell: (t) => TRANSACTION_LABELS[t.type] },
    {
      key: "change",
      header: "Thay đổi",
      align: "right",
      cell: (t) => (
        <span className={cn("tabular font-medium", t.quantity_change > 0 ? "text-success-strong" : "text-destructive-strong")}>
          {t.quantity_change > 0 ? "+" : "−"}
          {formatNumber(Math.abs(t.quantity_change))}
        </span>
      ),
    },
    { key: "after", header: "Tồn sau", align: "right", cell: (t) => <span className="tabular">{formatNumber(t.quantity_after)}</span> },
    ...(can(P.COST_VIEW)
      ? [{ key: "cost", header: "Giá vốn", align: "right" as const, cell: (t: LedgerEntry) => <span className="tabular">{formatMoney(t.unit_cost)}</span> }]
      : []),
    {
      key: "ref",
      header: "Chứng từ",
      cell: (t) => {
        const to = referenceLink(t);
        return to && t.reference_code ? (
          <Link to={to} className="tabular text-primary hover:underline">
            {t.reference_code}
          </Link>
        ) : (
          (t.reference_code ?? "—")
        );
      },
    },
    { key: "by", header: "Người thực hiện", cell: (t) => t.created_by.full_name },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <Select aria-label="Loại biến động" value={filters.type ?? ""} onChange={(e) => list.setFilter("type", e.target.value || undefined)} className="w-48">
          <option value="">Mọi loại</option>
          {Object.entries(TRANSACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
        {filters.product_id && (
          <Button variant="ghost" size="sm" onClick={() => list.setFilter("product_id", undefined)}>
            Bỏ lọc sản phẩm ✕
          </Button>
        )}
      </div>
      <DataTable
        caption="Lịch sử biến động kho"
        columns={columns}
        rows={data?.items}
        rowKey={(t) => t.id}
        isPending={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        emptyTitle="Không có biến động kho phù hợp"
      />
      {data && data.total > 0 && (
        <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </Card>
  );
}

function AdjustmentsTab() {
  const list = useListParams();
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useAdjustments(list.apiParams);

  const columns: Column<AdjustmentSummary>[] = [
    {
      key: "code",
      header: "Mã phiếu",
      cell: (a) => (
        <Link to={`/inventory/adjustments/${a.id}`} className="tabular font-medium text-primary hover:underline">
          {a.code}
        </Link>
      ),
    },
    { key: "type", header: "Loại", cell: (a) => (a.type === "STOCKTAKE" ? "Kiểm kê" : "Điều chỉnh") },
    { key: "reason", header: "Lý do", className: "min-w-56", cell: (a) => a.reason },
    { key: "items", header: "Sản phẩm", align: "right", cell: (a) => <span className="tabular">{a.item_count}</span> },
    { key: "by", header: "Người tạo", cell: (a) => a.created_by.full_name },
    { key: "time", header: "Thời gian", cell: (a) => <span className="tabular whitespace-nowrap text-muted">{formatDateTime(a.created_at)}</span> },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <Select aria-label="Loại phiếu" value={filters.type ?? ""} onChange={(e) => list.setFilter("type", e.target.value || undefined)} className="w-44">
          <option value="">Mọi loại</option>
          <option value="ADJUSTMENT">Điều chỉnh</option>
          <option value="STOCKTAKE">Kiểm kê</option>
        </Select>
        <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
      </div>
      <DataTable
        caption="Phiếu điều chỉnh kho"
        columns={columns}
        rows={data?.items}
        rowKey={(a) => a.id}
        isPending={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => refetch()}
        emptyTitle="Chưa có phiếu điều chỉnh"
      />
      {data && data.total > 0 && (
        <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      )}
    </Card>
  );
}

export function InventoryPage() {
  const { can } = useAuth();
  const canAdjust = can(P.INVENTORY_ADJUST);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = canAdjust ? TABS : TABS.filter((t) => t.id === "stock");
  const tab = (tabs.find((t) => t.id === searchParams.get("tab"))?.id ?? "stock") as TabId;

  return (
    <>
      <PageHeader
        title="Tồn kho"
        description="Mọi thay đổi tồn kho đều có chứng từ và được ghi vào lịch sử."
        actions={
          canAdjust && (
            <>
              <Link to="/inventory/adjustments/new?type=STOCKTAKE" className={buttonClass({ variant: "outline" })}>
                <ClipboardCheck className="h-4 w-4" aria-hidden /> Kiểm kê
              </Link>
              <Link to="/inventory/adjustments/new?type=ADJUSTMENT" className={buttonClass()}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Điều chỉnh kho
              </Link>
            </>
          )
        }
      />
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Chế độ xem kho" className="mb-4 flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              // Đổi tab: bỏ bộ lọc của tab cũ (mỗi tab có bộ lọc riêng)
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
      {tab === "stock" && <StockTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "adjustments" && <AdjustmentsTab />}
    </>
  );
}
