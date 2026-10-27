import { AlertTriangle, PackageX, Receipt, TrendingUp, Wallet, Warehouse } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { StatCard } from "@/components/common/StatCard";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/States";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { OrderStatusBadge } from "@/features/sales/OrderStatusBadge";
import { cn } from "@/utils/cn";
import { addDays, formatDateTime, formatMoney, formatNumber, toNumber, vnToday } from "@/utils/format";

import { type DashboardParams, type GroupBy, useDashboard } from "./api";
import { RevenueChart } from "./RevenueChart";

const PRESETS = [
  { id: "7d", label: "7 ngày" },
  { id: "30d", label: "30 ngày" },
  { id: "90d", label: "90 ngày" },
  { id: "month", label: "Tháng này" },
] as const;
type PresetId = (typeof PRESETS)[number]["id"];

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
];

function rangeOf(preset: PresetId): { date_from: string; date_to: string } {
  const today = vnToday();
  if (preset === "month") return { date_from: `${today.slice(0, 8)}01`, date_to: today };
  const days = { "7d": 7, "30d": 30, "90d": 90 }[preset];
  return { date_from: addDays(today, -(days - 1)), date_to: today };
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded px-3 py-1 text-sm transition-colors",
            value === option.id ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function DashboardPage() {
  // Bộ lọc nằm trên URL → tải lại trang / chia sẻ link giữ nguyên khoảng thời gian
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = (PRESETS.find((p) => p.id === searchParams.get("range"))?.id ?? "30d") as PresetId;
  const groupBy = (GROUPS.find((g) => g.id === searchParams.get("group"))?.id ?? "day") as GroupBy;
  const params: DashboardParams = { ...rangeOf(preset), group_by: groupBy };
  const { data, error, isPending, isFetching, refetch } = useDashboard(params);

  const update = (key: string, value: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });

  const kpis = data?.kpis;
  const margin = kpis && toNumber(kpis.net_revenue) > 0 ? (toNumber(kpis.gross_profit) / toNumber(kpis.net_revenue)) * 100 : null;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description="Số liệu tính trực tiếp từ đơn hàng, phiếu trả và tồn kho (giờ Việt Nam)."
        actions={
          // Một hàng bộ lọc phía trên mọi biểu đồ — tất cả số liệu kỳ cùng đổi theo
          <>
            <Segmented label="Khoảng thời gian" options={PRESETS} value={preset} onChange={(id) => update("range", id)} />
            <Segmented label="Gom nhóm theo" options={GROUPS} value={groupBy} onChange={(id) => update("group", id)} />
          </>
        }
      />

      {error && !data ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      ) : (
        <div className={cn("space-y-6 transition-opacity", isFetching && !isPending && "opacity-60")} aria-busy={isFetching}>
          <section aria-label="Chỉ số chính" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {isPending || !kpis ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)
            ) : (
              <>
                <StatCard
                  label="Doanh thu hôm nay"
                  icon={Wallet}
                  value={formatMoney(kpis.today_net_revenue)}
                  hint={`${formatNumber(kpis.today_order_count)} đơn`}
                />
                <StatCard
                  label="Doanh thu thuần (kỳ)"
                  icon={Receipt}
                  tone="info"
                  value={formatMoney(kpis.net_revenue)}
                  hint={`${formatNumber(kpis.order_count)} đơn · hoàn trả ${formatMoney(kpis.refunds)}`}
                />
                <StatCard
                  label="Lợi nhuận gộp ước tính"
                  icon={TrendingUp}
                  tone="success"
                  value={formatMoney(kpis.gross_profit)}
                  valueTone={toNumber(kpis.gross_profit) < 0 ? "negative" : undefined}
                  hint={margin === null ? "—" : `Biên lợi nhuận ${margin.toFixed(1).replace(".", ",")}%`}
                />
                <StatCard
                  label="Giá trị tồn kho"
                  icon={Warehouse}
                  tone="info"
                  value={formatMoney(kpis.inventory_value)}
                  hint={`${formatNumber(kpis.active_product_count)} sản phẩm đang bán`}
                />
                <StatCard
                  label="Sắp hết hàng"
                  icon={AlertTriangle}
                  tone="warning"
                  value={formatNumber(kpis.low_stock_count)}
                  valueTone={kpis.low_stock_count > 0 ? "warning" : undefined}
                  hint={<Link to="/inventory?low_stock=true" className="text-primary hover:underline">Xem tồn kho</Link>}
                />
              </>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Doanh thu và lợi nhuận" description="Theo ngày bán; tiền hoàn tính vào ngày trả hàng" />
              <CardContent>
                {isPending ? <Skeleton className="h-80" /> : <RevenueChart rows={data!.revenue_series} groupBy={groupBy} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Bán chạy nhất" description="Theo doanh thu ròng trong kỳ" />
              <CardContent>
                {isPending ? (
                  <Skeleton className="h-64" />
                ) : data!.top_products.length === 0 ? (
                  <EmptyState title="Chưa có đơn hàng trong kỳ" />
                ) : (
                  <ol className="space-y-3">
                    {data!.top_products.map((p, index) => {
                      const max = toNumber(data!.top_products[0].revenue) || 1;
                      return (
                        <li key={p.product_id}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">
                              <span className="mr-2 text-muted">{index + 1}.</span>
                              {p.name}
                            </span>
                            <span className="tabular shrink-0 font-medium">{formatMoney(p.revenue)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-surface-muted">
                              <div
                                className="h-1.5 rounded-full bg-series-1"
                                style={{ width: `${Math.max(2, (toNumber(p.revenue) / max) * 100)}%` }}
                              />
                            </div>
                            <span className="tabular w-16 text-right text-xs text-muted">{formatNumber(p.quantity)} SP</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Đơn hàng gần đây"
                actions={<Link to="/orders" className="text-sm text-primary hover:underline">Xem tất cả</Link>}
              />
              <CardContent className="px-0 pb-2">
                {isPending ? (
                  <Skeleton className="mx-5 h-48" />
                ) : data!.recent_orders.length === 0 ? (
                  <EmptyState title="Chưa có đơn hàng" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted">
                        <tr className="border-b border-border">
                          <th className="px-5 py-2 font-medium">Mã đơn</th>
                          <th className="px-3 py-2 font-medium">Khách hàng</th>
                          <th className="px-3 py-2 text-right font-medium">Tổng tiền</th>
                          <th className="px-3 py-2 font-medium">Trạng thái</th>
                          <th className="px-5 py-2 text-right font-medium">Thời gian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data!.recent_orders.map((order) => (
                          <tr key={order.id} className="hover:bg-surface-hover">
                            <td className="px-5 py-2.5 font-medium">
                              <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
                                {order.code}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">{order.customer?.name ?? <span className="text-muted">Khách lẻ</span>}</td>
                            <td className="tabular px-3 py-2.5 text-right">{formatMoney(order.total_amount)}</td>
                            <td className="px-3 py-2.5">
                              <OrderStatusBadge order={order} />
                            </td>
                            <td className="tabular px-5 py-2.5 text-right whitespace-nowrap text-muted">
                              {formatDateTime(order.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Cảnh báo tồn kho" description="Sản phẩm có tồn ≤ mức tối thiểu" />
              <CardContent>
                {isPending ? (
                  <Skeleton className="h-48" />
                ) : data!.low_stock_items.length === 0 ? (
                  <EmptyState title="Không có sản phẩm sắp hết" />
                ) : (
                  <ul className="divide-y divide-border">
                    {data!.low_stock_items.map((item) => (
                      <li key={item.product_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate">{item.name}</span>
                          <span className="tabular text-xs text-muted">
                            {item.sku} · tối thiểu {formatNumber(item.min_stock)}
                          </span>
                        </span>
                        {item.quantity === 0 ? (
                          <Badge variant="destructive" icon={<PackageX className="h-3.5 w-3.5" aria-hidden />}>
                            Hết hàng
                          </Badge>
                        ) : (
                          <Badge variant="warning" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>
                            Còn {formatNumber(item.quantity)}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
