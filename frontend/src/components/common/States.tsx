import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { ApiError } from "@/services/apiError";

/** Trạng thái rỗng: icon + câu mô tả + (tùy chọn) nút hành động — docs/05 §4. */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-10 w-10 text-slate-300" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Trạng thái lỗi: thông báo + nút "Thử lại" + mã request để đối chiếu log máy chủ. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      <p className="font-medium">Không tải được dữ liệu</p>
      <p className="max-w-md text-sm text-muted">{apiError?.message ?? "Đã xảy ra lỗi không xác định."}</p>
      {apiError?.requestId && <p className="text-xs text-slate-400">Mã yêu cầu: {apiError.requestId}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RotateCw className="h-4 w-4" /> Thử lại
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
