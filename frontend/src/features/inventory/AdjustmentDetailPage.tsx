import { Link, useParams } from "react-router";

import { ErrorState, PageHeader } from "@/components/common/States";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { cn } from "@/utils/cn";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import { useAdjustment } from "./api";

export function AdjustmentDetailPage() {
  const adjustmentId = Number(useParams().id);
  const { data: a, error, isPending, refetch } = useAdjustment(adjustmentId);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Skeleton className="h-96" />;
  const isStocktake = a.type === "STOCKTAKE";
  const showCost = a.items.some((i) => i.unit_cost !== undefined);

  return (
    <>
      <PageHeader title={`${isStocktake ? "Phiếu kiểm kê" : "Phiếu điều chỉnh"} ${a.code}`} description={a.reason} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Loại</dt><dd>{isStocktake ? "Kiểm kê" : "Điều chỉnh"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Người tạo</dt><dd>{a.created_by.full_name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Thời gian</dt><dd className="tabular">{formatDateTime(a.created_at)}</dd></div>
            </dl>
            {a.note && <p className="mt-4 border-t border-border pt-3 text-sm whitespace-pre-line text-muted">{a.note}</p>}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Sản phẩm điều chỉnh" description={`${a.items.length} sản phẩm`} />
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 text-right font-medium">Tồn trước</th>
                  {isStocktake && <th className="px-3 py-2 text-right font-medium">Số đếm</th>}
                  <th className="px-3 py-2 text-right font-medium">Thay đổi</th>
                  {showCost && <th className="px-5 py-2 text-right font-medium">Giá vốn</th>}
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-border">
                {a.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-2.5">
                      <Link to={`/products/${i.product_id}`} className="font-sans hover:text-primary hover:underline">
                        {i.product_name}
                      </Link>
                      <span className="block text-xs text-muted">{i.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(i.quantity_before)}</td>
                    {isStocktake && <td className="px-3 py-2.5 text-right">{formatNumber(i.counted_quantity ?? 0)}</td>}
                    <td className={cn("px-3 py-2.5 text-right font-medium", i.quantity_change > 0 ? "text-green-700" : "text-red-700")}>
                      {i.quantity_change > 0 ? "+" : "−"}
                      {formatNumber(Math.abs(i.quantity_change))}
                    </td>
                    {showCost && <td className="px-5 py-2.5 text-right">{formatMoney(i.unit_cost)}</td>}
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
