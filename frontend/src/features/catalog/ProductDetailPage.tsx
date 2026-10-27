import { Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { toApiError } from "@/services/apiError";
import { cn } from "@/utils/cn";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import { useProduct, useProductStock, useSetProductActive } from "./api";
import { ActiveBadge, ProductThumb, StockCell, TRANSACTION_LABELS } from "./components";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

export function ProductDetailPage() {
  const productId = Number(useParams().id);
  const { can } = useAuth();
  const product = useProduct(productId);
  const stock = useProductStock(productId);
  const setActive = useSetProductActive();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (product.error) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  if (product.isPending) return <Skeleton className="h-96" />;
  const p = product.data;

  const toggleActive = () =>
    setActive.mutate(
      { id: p.id, is_active: !p.is_active },
      {
        onSuccess: () => {
          toast.success(p.is_active ? "Đã ngừng kinh doanh sản phẩm" : "Đã kinh doanh lại sản phẩm");
          setConfirmOpen(false);
        },
        onError: (error) => toast.error(toApiError(error).message),
      },
    );

  return (
    <>
      <PageHeader
        title={p.name}
        description={`SKU ${p.sku}`}
        actions={
          can(P.CATALOG_MANAGE) && (
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                {p.is_active ? "Ngừng kinh doanh" : "Kinh doanh lại"}
              </Button>
              <Link to={`/products/${p.id}/edit`} className={buttonClass()}>
                <Pencil className="h-4 w-4" aria-hidden /> Sửa
              </Link>
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent className="space-y-5">
            <ProductThumb url={p.image_url} name={p.name} className="h-40 w-40 rounded-xl text-5xl" />
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Info label="Trạng thái"><ActiveBadge active={p.is_active} /></Info>
              <Info label="Tồn kho"><StockCell quantity={p.quantity} isLow={p.is_low_stock} /></Info>
              <Info label="Giá bán"><span className="tabular">{formatMoney(p.sale_price)}</span></Info>
              {p.avg_cost !== undefined && (
                <Info label="Giá vốn bình quân"><span className="tabular">{formatMoney(p.avg_cost)}</span></Info>
              )}
              <Info label="Danh mục">{p.category.name}</Info>
              <Info label="Thương hiệu">{p.brand?.name ?? "—"}</Info>
              <Info label="Đơn vị tính">{p.unit}</Info>
              <Info label="Tồn tối thiểu"><span className="tabular">{formatNumber(p.min_stock)}</span></Info>
              <Info label="Mã vạch">{p.barcode ?? "—"}</Info>
            </dl>
            {p.description && <p className="text-sm whitespace-pre-line text-muted">{p.description}</p>}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Biến động kho gần đây" description="20 giao dịch mới nhất" />
          <CardContent className="px-0">
            {stock.error ? (
              <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
            ) : stock.isPending ? (
              <Skeleton className="mx-5 h-48" />
            ) : stock.data.recent_transactions.length === 0 ? (
              <EmptyState title="Chưa có biến động kho" description="Tồn kho tăng khi xác nhận phiếu nhập hàng." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-b border-border">
                      <th className="px-5 py-2 font-medium">Thời gian</th>
                      <th className="px-3 py-2 font-medium">Loại</th>
                      <th className="px-3 py-2 text-right font-medium">Thay đổi</th>
                      <th className="px-3 py-2 text-right font-medium">Tồn sau</th>
                      <th className="px-3 py-2 font-medium">Chứng từ</th>
                      <th className="px-5 py-2 font-medium">Người thực hiện</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stock.data.recent_transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="tabular px-5 py-2 whitespace-nowrap text-muted">{formatDateTime(tx.created_at)}</td>
                        <td className="px-3 py-2">{TRANSACTION_LABELS[tx.type]}</td>
                        <td
                          className={cn(
                            "tabular px-3 py-2 text-right font-medium",
                            tx.quantity_change > 0 ? "text-success-strong" : "text-destructive-strong",
                          )}
                        >
                          {tx.quantity_change > 0 ? "+" : "−"}
                          {formatNumber(Math.abs(tx.quantity_change))}
                        </td>
                        <td className="tabular px-3 py-2 text-right">{formatNumber(tx.quantity_after)}</td>
                        <td className="px-3 py-2">{tx.reference_code ?? "—"}</td>
                        <td className="px-5 py-2">{tx.created_by.full_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={p.is_active ? "Ngừng kinh doanh sản phẩm?" : "Kinh doanh lại sản phẩm?"}
        description={
          p.is_active
            ? `"${p.name}" sẽ không bán được ở quầy và không thêm được vào phiếu nhập mới. Lịch sử giao dịch vẫn được giữ nguyên.`
            : `"${p.name}" sẽ bán và nhập hàng lại được.`
        }
        confirmLabel={p.is_active ? "Ngừng kinh doanh" : "Kinh doanh lại"}
        destructive={p.is_active}
        loading={setActive.isPending}
        onConfirm={toggleActive}
      />
    </>
  );
}
