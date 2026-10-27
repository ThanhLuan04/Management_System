import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/Button";
import { formatDate, formatMoney, formatMoneyCompact, formatNumber, toNumber } from "@/utils/format";

import type { GroupBy, RevenueRow } from "./api";

const SERIES = [
  { key: "net_revenue", label: "Doanh thu thuần", color: "var(--series-1)" },
  { key: "gross_profit", label: "Lợi nhuận gộp", color: "var(--series-2)" },
] as const;

function periodLabel(period: string, groupBy: GroupBy, long = false): string {
  const [year, month, day] = period.split("-");
  if (groupBy === "month") return `${month}/${year}`;
  if (groupBy === "week") return long ? `Tuần từ ${formatDate(period)}` : `${day}/${month}`;
  return long ? formatDate(period) : `${day}/${month}`;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  groupBy: GroupBy;
}

function ChartTooltip({ active, payload, groupBy }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as RevenueRow;
  return (
    <div className="min-w-48 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium">{periodLabel(row.period, groupBy, true)}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
          <span className="tabular font-medium">{formatMoney(row[s.key])}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between gap-4 text-muted">
        <span>Số đơn</span>
        <span className="tabular">{formatNumber(row.order_count)}</span>
      </p>
    </div>
  );
}

/**
 * Doanh thu thuần (cột) và lợi nhuận gộp (đường) trên MỘT trục — cùng đơn vị VND nên không cần trục thứ hai.
 * Luôn có chú thích (2 chuỗi) và chế độ xem bảng (truy cập được mà không cần đọc biểu đồ).
 */
export function RevenueChart({ rows, groupBy }: { rows: RevenueRow[]; groupBy: GroupBy }) {
  const [showTable, setShowTable] = useState(false);
  const data = rows.map((r) => ({ ...r, net: toNumber(r.net_revenue), profit: toNumber(r.gross_profit) }));
  const hasNegative = data.some((d) => d.net < 0 || d.profit < 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-sm" aria-label="Chú thích">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-muted">
              <span
                className={s.key === "net_revenue" ? "h-3 w-3 rounded-sm" : "h-0.5 w-4 rounded-full"}
                style={{ background: s.color }}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? "Xem biểu đồ" : "Xem dạng bảng"}
        </Button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-hover text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Kỳ</th>
                <th className="px-3 py-2 text-right font-medium">Số đơn</th>
                <th className="px-3 py-2 text-right font-medium">Doanh thu thuần</th>
                <th className="px-3 py-2 text-right font-medium">Lợi nhuận gộp</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.period}>
                  <td className="px-3 py-1.5">{periodLabel(r.period, groupBy, true)}</td>
                  <td className="px-3 py-1.5 text-right">{formatNumber(r.order_count)}</td>
                  <td className="px-3 py-1.5 text-right">{formatMoney(r.net_revenue)}</td>
                  <td className="px-3 py-1.5 text-right">{formatMoney(r.gross_profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Chiều cao đã gồm dải nhãn trục X → không sinh thanh cuộn lồng trong thẻ
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="period"
                tickFormatter={(p: string) => periodLabel(p, groupBy)}
                tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--chart-grid)" }}
                minTickGap={16}
              />
              <YAxis
                tickFormatter={formatMoneyCompact}
                tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              {hasNegative && <ReferenceLine y={0} stroke="var(--chart-axis)" />}
              <Tooltip
                content={({ active, payload }) => (
                  <ChartTooltip active={active} payload={payload} groupBy={groupBy} />
                )}
                cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
              />
              <Bar dataKey="net" name="Doanh thu thuần" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line
                dataKey="profit"
                name="Lợi nhuận gộp"
                stroke="var(--series-2)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
