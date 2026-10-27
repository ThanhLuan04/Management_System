import { Download } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { ErrorState, EmptyState, PageHeader } from "@/components/common/States";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import type { GroupBy } from "@/features/dashboard/api";
import { RevenueChart } from "@/features/dashboard/RevenueChart";
import { StockCell } from "@/features/catalog/components";
import { toApiError } from "@/services/apiError";
import { downloadFile } from "@/services/download";
import { cn } from "@/utils/cn";
import { formatDate, formatMoney, formatNumber, toNumber } from "@/utils/format";

import { useInventoryReport, usePurchasesBySupplier, useRevenueReport, useTopProducts } from "./api";
import { matchPreset, presetRange, RANGE_PRESETS } from "./ranges";

const TABS = [
  { id: "revenue", label: "Doanh thu & lợi nhuận", csv: "revenue" },
  { id: "top", label: "Bán chạy", csv: "top-products" },
  { id: "inventory", label: "Tồn kho", csv: "inventory" },
  { id: "purchases", label: "Nhập hàng theo NCC", csv: "purchases-by-supplier" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
];

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "negative" }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "negative" && "text-red-700")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function Loading() {
  return <Skeleton className="h-80" />;
}

// ---------- Doanh thu ----------

function RevenueTab({ params }: { params: { date_from: string; date_to: string; group_by: GroupBy } }) {
  const { data, error, isPending, isFetching, refetch } = useRevenueReport(params);
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Loading />;
  const t = data.totals;
  const margin = toNumber(t.net_revenue) > 0 ? (toNumber(t.gross_profit) / toNumber(t.net_revenue)) * 100 : null;

  return (
    <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-60")}>
      <section aria-label="Tổng kỳ" className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Doanh thu gộp" value={formatMoney(t.gross_revenue)} hint={`${formatNumber(t.order_count)} đơn`} />
        <Stat label="Tiền hoàn trả" value={formatMoney(t.refunds)} />
        <Stat label="Doanh thu thuần" value={formatMoney(t.net_revenue)} />
        <Stat label="Giá vốn hàng bán" value={formatMoney(t.cogs)} />
        <Stat
          label="Lợi nhuận gộp"
          value={formatMoney(t.gross_profit)}
          tone={toNumber(t.gross_profit) < 0 ? "negative" : undefined}
          hint={margin === null ? undefined : `Biên ${margin.toFixed(1).replace(".", ",")}%`}
        />
        <Stat label="Giá trị đơn trung bình" value={formatMoney(t.average_order_value)} />
      </section>
      <Card>
        <CardHeader title="Biểu đồ theo kỳ" description="Doanh thu theo ngày bán; tiền hoàn tính vào ngày trả hàng" />
        <CardContent>
          <RevenueChart rows={data.series} groupBy={params.group_by} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Chi tiết theo kỳ" />
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2 font-medium">Kỳ</th>
                <th className="px-3 py-2 text-right font-medium">Số đơn</th>
                <th className="px-3 py-2 text-right font-medium">Doanh thu gộp</th>
                <th className="px-3 py-2 text-right font-medium">Hoàn trả</th>
                <th className="px-3 py-2 text-right font-medium">Doanh thu thuần</th>
                <th className="px-3 py-2 text-right font-medium">Giá vốn</th>
                <th className="px-5 py-2 text-right font-medium">Lợi nhuận gộp</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {data.series.map((r) => (
                <tr key={r.period}>
                  <td className="px-5 py-2">{formatDate(r.period)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.order_count)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.gross_revenue)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.refunds)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.net_revenue)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.cogs)}</td>
                  <td className={cn("px-5 py-2 text-right font-medium", toNumber(r.gross_profit) < 0 && "text-red-700")}>{formatMoney(r.gross_profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular border-t-2 border-border font-semibold">
              <tr>
                <td className="px-5 py-2">Tổng</td>
                <td className="px-3 py-2 text-right">{formatNumber(t.order_count)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(t.gross_revenue)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(t.refunds)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(t.net_revenue)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(t.cogs)}</td>
                <td className="px-5 py-2 text-right">{formatMoney(t.gross_profit)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Bán chạy ----------

function TopProductsTab({ range }: { range: { date_from: string; date_to: string } }) {
  const [by, setBy] = useState<"quantity" | "revenue">("quantity");
  const [limit, setLimit] = useState(20);
  const { data, error, isPending, isFetching, refetch } = useTopProducts({ ...range, by, limit });
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const max = data?.length ? Math.max(...data.map((r) => (by === "quantity" ? r.quantity : toNumber(r.revenue))), 1) : 1;
  return (
    <Card>
      <CardHeader
        title="Sản phẩm bán chạy"
        description="Bán ròng trong kỳ: số bán trừ số trả lại; không tính đơn đã hủy"
        actions={
          <div className="flex gap-2">
            <Select aria-label="Xếp hạng theo" value={by} onChange={(e) => setBy(e.target.value as typeof by)} className="w-44">
              <option value="quantity">Theo số lượng</option>
              <option value="revenue">Theo doanh thu</option>
            </Select>
            <Select aria-label="Số sản phẩm" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-24">
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <CardContent className={cn("overflow-x-auto px-0 transition-opacity", isFetching && !isPending && "opacity-60")}>
        {isPending ? (
          <Skeleton className="mx-5 h-64" />
        ) : data.length === 0 ? (
          <EmptyState title="Chưa có đơn hàng trong kỳ" />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="w-12 px-5 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Sản phẩm</th>
                <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                <th className="px-3 py-2 text-right font-medium">Doanh thu ròng</th>
                <th className="w-48 px-5 py-2"><span className="sr-only">Tỷ lệ</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r, i) => (
                <tr key={r.product_id}>
                  <td className="tabular px-5 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link to={`/products/${r.product_id}`} className="hover:text-primary hover:underline">{r.name}</Link>
                    <span className="tabular block text-xs text-muted">{r.sku}</span>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{formatNumber(r.quantity)}</td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(r.revenue)}</td>
                  <td className="px-5 py-2" aria-hidden>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-series-1"
                        style={{ width: `${Math.max(2, ((by === "quantity" ? r.quantity : toNumber(r.revenue)) / max) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Tồn kho ----------

function InventoryTab({ lowStock, includeInactive }: { lowStock: boolean; includeInactive: boolean }) {
  const { data, error, isPending, isFetching, refetch } = useInventoryReport({ low_stock: lowStock, include_inactive: includeInactive });
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Loading />;
  return (
    <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-60")}>
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Tổng quan tồn kho">
        <Stat label="Số sản phẩm" value={formatNumber(data.product_count)} />
        <Stat label="Tổng số lượng tồn" value={formatNumber(data.total_quantity)} />
        <Stat label="Giá trị tồn kho" value={formatMoney(data.total_value)} hint="Tồn × giá vốn bình quân" />
        <Stat label="Sắp hết hàng" value={formatNumber(data.low_stock_count)} />
      </section>
      <Card>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2 font-medium">Sản phẩm</th>
                <th className="px-3 py-2 font-medium">Danh mục</th>
                <th className="px-3 py-2 text-right font-medium">Tồn</th>
                <th className="px-3 py-2 text-right font-medium">Tối thiểu</th>
                <th className="px-3 py-2 text-right font-medium">Giá vốn BQ</th>
                <th className="px-5 py-2 text-right font-medium">Giá trị tồn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((i) => (
                <tr key={i.product_id}>
                  <td className="px-5 py-2">
                    <Link to={`/products/${i.product_id}`} className="hover:text-primary hover:underline">{i.name}</Link>
                    <span className="tabular block text-xs text-muted">{i.sku}{!i.is_active && " · ngừng kinh doanh"}</span>
                  </td>
                  <td className="px-3 py-2">{i.category_name}</td>
                  <td className="px-3 py-2 text-right"><StockCell quantity={i.quantity} isLow={i.is_low_stock} /></td>
                  <td className="tabular px-3 py-2 text-right text-muted">{formatNumber(i.min_stock)}</td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(i.avg_cost)}</td>
                  <td className="tabular px-5 py-2 text-right font-medium">{formatMoney(i.stock_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <EmptyState title="Không có sản phẩm phù hợp" />}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Nhập hàng theo NCC ----------

function PurchasesTab({ range }: { range: { date_from: string; date_to: string } }) {
  const { data, error, isPending, isFetching, refetch } = usePurchasesBySupplier(range);
  if (error && !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Loading />;
  const total = data.reduce((sum, r) => sum + toNumber(r.total_amount), 0);
  return (
    <Card>
      <CardHeader title="Nhập hàng theo nhà cung cấp" description="Chỉ tính phiếu đã xác nhận, theo ngày nhập kho" />
      <CardContent className={cn("overflow-x-auto px-0 transition-opacity", isFetching && "opacity-60")}>
        {data.length === 0 ? (
          <EmptyState title="Không có phiếu nhập nào được xác nhận trong kỳ" />
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-2 font-medium">Nhà cung cấp</th>
                <th className="px-3 py-2 text-right font-medium">Số phiếu</th>
                <th className="px-3 py-2 text-right font-medium">Số lượng nhập</th>
                <th className="px-3 py-2 text-right font-medium">Tổng tiền</th>
                <th className="px-5 py-2 text-right font-medium">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {data.map((r) => (
                <tr key={r.supplier_id}>
                  <td className="px-5 py-2 font-sans">
                    {r.supplier_name}
                    <span className="block text-xs text-muted">{r.supplier_code}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.purchase_count)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.total_quantity)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.total_amount)}</td>
                  <td className="px-5 py-2 text-right">{total > 0 ? `${((toNumber(r.total_amount) / total) * 100).toFixed(1).replace(".", ",")}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular border-t-2 border-border font-semibold">
              <tr>
                <td className="px-5 py-2 font-sans">Tổng</td>
                <td className="px-3 py-2 text-right">{formatNumber(data.reduce((s, r) => s + r.purchase_count, 0))}</td>
                <td className="px-3 py-2 text-right">{formatNumber(data.reduce((s, r) => s + r.total_quantity, 0))}</td>
                <td className="px-3 py-2 text-right">{formatMoney(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Trang ----------

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const tab = (TABS.find((t) => t.id === searchParams.get("tab"))?.id ?? "revenue") as TabId;
  const fallback = presetRange("30d");
  const range = {
    date_from: searchParams.get("date_from") ?? fallback.date_from,
    date_to: searchParams.get("date_to") ?? fallback.date_to,
  };
  const groupBy = (GROUPS.find((g) => g.id === searchParams.get("group_by"))?.id ?? "day") as GroupBy;
  const lowStock = searchParams.get("low_stock") === "true";
  const includeInactive = searchParams.get("include_inactive") === "true";
  const activePreset = matchPreset(range.date_from, range.date_to);
  const usesRange = tab !== "inventory";

  const update = (changes: Record<string, string | undefined>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );

  const exportCsv = async () => {
    const current = TABS.find((t) => t.id === tab)!;
    const params =
      tab === "revenue"
        ? { ...range, group_by: groupBy }
        : tab === "top"
          ? { ...range, limit: 100 }
          : tab === "inventory"
            ? { low_stock: lowStock, include_inactive: includeInactive }
            : range;
    setExporting(true);
    try {
      await downloadFile(`/reports/${current.csv}`, { ...params, format: "csv" }, `${current.csv}.csv`);
    } catch (error) {
      toast.error(toApiError(error).message);
    } finally {
      setExporting(false);
    }
  };

  const rangeInvalid = range.date_from > range.date_to;

  return (
    <>
      <PageHeader
        title="Báo cáo"
        description="Số liệu tính trực tiếp từ đơn hàng, phiếu trả, phiếu nhập và tồn kho (ngày theo giờ Việt Nam)."
        actions={
          <Button variant="outline" onClick={exportCsv} loading={exporting} disabled={usesRange && rangeInvalid}>
            <Download className="h-4 w-4" aria-hidden /> Xuất CSV
          </Button>
        }
      />

      <div role="tablist" aria-label="Loại báo cáo" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => update({ tab: t.id })}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Một hàng bộ lọc phía trên mọi số liệu của tab */}
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-3">
        {usesRange ? (
          <>
            <div role="radiogroup" aria-label="Khoảng thời gian" className="flex flex-wrap gap-1">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={activePreset === p.id}
                  onClick={() => update(presetRange(p.id))}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    activePreset === p.id ? "bg-primary text-primary-foreground" : "text-muted hover:bg-slate-100 hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Input type="date" aria-label="Từ ngày" value={range.date_from} onChange={(e) => e.target.value && update({ date_from: e.target.value })} className="w-40" />
              <span className="text-muted">→</span>
              <Input type="date" aria-label="Đến ngày" value={range.date_to} onChange={(e) => e.target.value && update({ date_to: e.target.value })} className="w-40" />
            </div>
            {tab === "revenue" && (
              <Select aria-label="Gom nhóm theo" value={groupBy} onChange={(e) => update({ group_by: e.target.value })} className="w-32">
                {GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    Theo {g.label.toLowerCase()}
                  </option>
                ))}
              </Select>
            )}
            {rangeInvalid && <p className="text-sm text-destructive">Ngày bắt đầu phải trước ngày kết thúc</p>}
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={lowStock} onChange={(e) => update({ low_stock: e.target.checked ? "true" : undefined })} />
              Chỉ hàng sắp hết
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={includeInactive} onChange={(e) => update({ include_inactive: e.target.checked ? "true" : undefined })} />
              Gồm sản phẩm ngừng kinh doanh
            </label>
          </>
        )}
      </Card>

      {usesRange && rangeInvalid ? null : (
        <>
          {tab === "revenue" && <RevenueTab params={{ ...range, group_by: groupBy }} />}
          {tab === "top" && <TopProductsTab range={range} />}
          {tab === "inventory" && <InventoryTab lowStock={lowStock} includeInactive={includeInactive} />}
          {tab === "purchases" && <PurchasesTab range={range} />}
        </>
      )}
    </>
  );
}
