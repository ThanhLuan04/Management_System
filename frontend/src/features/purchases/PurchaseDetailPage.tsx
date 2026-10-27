import { CheckCircle2, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState, PageHeader } from "@/components/common/States";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Spinner";
import { toApiError } from "@/services/apiError";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

import { usePurchase, usePurchaseAction } from "./api";
import { PurchaseStatusBadge } from "./PurchaseStatusBadge";

export function PurchaseDetailPage() {
  const purchaseId = Number(useParams().id);
  const purchase = usePurchase(purchaseId);
  const action = usePurchaseAction(purchaseId);
  const [confirming, setConfirming] = useState<"confirm" | "cancel" | null>(null);

  if (purchase.error) return <ErrorState error={purchase.error} onRetry={() => purchase.refetch()} />;
  if (purchase.isPending) return <Skeleton className="h-96" />;
  const p = purchase.data;
  const totalQuantity = p.items.reduce((sum, i) => sum + i.quantity, 0);

  const run = (kind: "confirm" | "cancel") =>
    action.mutate(kind, {
      onSuccess: () => {
        toast.success(kind === "confirm" ? "Đã nhập kho thành công" : "Đã hủy phiếu nháp");
        setConfirming(null);
      },
      onError: (error) => {
        const apiError = toApiError(error);
        const skus = (apiError.details as { skus?: string[] } | undefined)?.skus;
        toast.error(skus ? `${apiError.message}: ${skus.join(", ")}` : apiError.message);
        setConfirming(null);
      },
    });

  return (
    <>
      <PageHeader
        title={`Phiếu nhập ${p.code}`}
        description={`${p.supplier.code} · ${p.supplier.name}`}
        actions={
          p.status === "DRAFT" && (
            <>
              <Button variant="outline" onClick={() => setConfirming("cancel")}>
                Hủy phiếu
              </Button>
              <Link to={`/purchases/${p.id}/edit`} className={buttonClass({ variant: "outline" })}>
                <Pencil className="h-4 w-4" aria-hidden /> Sửa
              </Link>
              <Button onClick={() => setConfirming("confirm")}>
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Xác nhận nhập kho
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Trạng thái</dt><dd><PurchaseStatusBadge status={p.status} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Người tạo</dt><dd>{p.created_by.full_name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Ngày tạo</dt><dd className="tabular">{formatDateTime(p.created_at)}</dd></div>
              {p.confirmed_by && (
                <>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Người xác nhận</dt><dd>{p.confirmed_by.full_name}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Nhập kho lúc</dt><dd className="tabular">{formatDateTime(p.confirmed_at!)}</dd></div>
                </>
              )}
              {p.cancelled_at && (
                <div className="flex justify-between gap-4"><dt className="text-muted">Hủy lúc</dt><dd className="tabular">{formatDateTime(p.cancelled_at)}</dd></div>
              )}
              <div className="flex justify-between gap-4 border-t border-border pt-3"><dt className="text-muted">Tổng giá trị</dt><dd className="tabular text-lg font-bold">{formatMoney(p.total_amount)}</dd></div>
            </dl>
            {p.note && <p className="mt-4 border-t border-border pt-3 text-sm whitespace-pre-line text-muted">{p.note}</p>}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Danh sách hàng nhập" description={`${p.items.length} mặt hàng · ${formatNumber(totalQuantity)} sản phẩm`} />
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 text-right font-medium">SL</th>
                  <th className="px-3 py-2 text-right font-medium">Giá nhập</th>
                  <th className="px-3 py-2 text-right font-medium">Chiết khấu</th>
                  <th className="px-5 py-2 text-right font-medium">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-border">
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-2.5">
                      <Link to={`/products/${i.product_id}`} className="font-sans font-medium hover:text-primary hover:underline">
                        {i.product_name}
                      </Link>
                      <span className="block text-xs text-muted">{i.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatNumber(i.quantity)} {i.unit}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(i.unit_cost)}</td>
                    <td className="px-3 py-2.5 text-right">{formatMoney(i.discount_amount)}</td>
                    <td className="px-5 py-2.5 text-right font-medium">{formatMoney(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming === "confirm"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Xác nhận nhập kho?"
        description={`Tồn kho sẽ được cộng thêm ${formatNumber(totalQuantity)} sản phẩm (${p.items.length} mặt hàng) và giá vốn bình quân được tính lại. Phiếu không thể sửa sau khi xác nhận.`}
        confirmLabel="Xác nhận nhập kho"
        loading={action.isPending}
        onConfirm={() => run("confirm")}
      />
      <ConfirmDialog
        open={confirming === "cancel"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Hủy phiếu nháp?"
        description="Phiếu sẽ chuyển sang trạng thái Đã hủy và không thể xác nhận nhập kho nữa. Tồn kho không thay đổi."
        confirmLabel="Hủy phiếu"
        destructive
        loading={action.isPending}
        onConfirm={() => run("cancel")}
      />
    </>
  );
}
