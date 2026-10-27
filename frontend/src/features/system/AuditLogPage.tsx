import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type Column, DataTable, Pagination } from "@/components/common/DataTable";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { PageHeader } from "@/components/common/States";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useListParams } from "@/hooks/useListParams";
import { http } from "@/services/http";
import type { Page, UserRef } from "@/types/api";
import { formatDateTime } from "@/utils/format";

interface AuditLog {
  id: number;
  user: UserRef | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Đăng nhập",
  LOGIN_FAILED: "Đăng nhập thất bại",
  LOGIN_LOCKED: "Khóa tạm do sai mật khẩu",
  REFRESH_TOKEN_REUSE: "Phát hiện dùng lại phiên cũ",
  PASSWORD_CHANGE: "Đổi mật khẩu",
  PROFILE_UPDATE: "Sửa hồ sơ",
  USER_CREATE: "Tạo người dùng",
  USER_UPDATE: "Sửa người dùng",
  USER_ACTIVATE: "Mở khóa người dùng",
  USER_DEACTIVATE: "Khóa người dùng",
  USER_RESET_PASSWORD: "Đặt lại mật khẩu",
  SETTINGS_UPDATE: "Sửa cài đặt",
  CATEGORY_CREATE: "Tạo danh mục",
  CATEGORY_UPDATE: "Sửa danh mục",
  BRAND_CREATE: "Tạo thương hiệu",
  BRAND_UPDATE: "Sửa thương hiệu",
  PRODUCT_CREATE: "Tạo sản phẩm",
  PRODUCT_UPDATE: "Sửa sản phẩm",
  PRODUCT_IMAGE_UPDATE: "Đổi ảnh sản phẩm",
  SUPPLIER_CREATE: "Tạo nhà cung cấp",
  SUPPLIER_UPDATE: "Sửa nhà cung cấp",
  CUSTOMER_CREATE: "Tạo khách hàng",
  CUSTOMER_UPDATE: "Sửa khách hàng",
  PURCHASE_CREATE: "Tạo phiếu nhập",
  PURCHASE_UPDATE: "Sửa phiếu nhập",
  PURCHASE_CONFIRM: "Xác nhận nhập kho",
  PURCHASE_CANCEL: "Hủy phiếu nhập",
  STOCK_ADJUSTMENT_CREATE: "Điều chỉnh / kiểm kê kho",
  ORDER_CREATE: "Bán hàng",
  ORDER_CANCEL: "Hủy đơn",
  RETURN_CREATE: "Trả hàng",
};

const ENTITY_TYPES = [
  "product",
  "category",
  "brand",
  "supplier",
  "customer",
  "purchase_order",
  "stock_adjustment",
  "sales_order",
  "sales_return",
  "user",
  "settings",
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Thay đổi dạng "trường: cũ → mới" (hoặc chỉ giá trị mới khi tạo). */
function Changes({ log }: { log: AuditLog }) {
  const keys = [...new Set([...Object.keys(log.old_values ?? {}), ...Object.keys(log.new_values ?? {})])];
  if (keys.length === 0) return <span className="text-muted">—</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {keys.map((key) => (
        <li key={key} className="break-all">
          <span className="text-muted">{key}:</span>{" "}
          {log.old_values && key in log.old_values && <><span className="line-through decoration-red-400">{formatValue(log.old_values[key])}</span> → </>}
          <span className="font-medium">{formatValue(log.new_values?.[key])}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuditLogPage() {
  const list = useListParams();
  const { filters } = list.state;
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["audit-logs", list.apiParams],
    queryFn: async () => (await http.get<Page<AuditLog>>("/audit-logs", { params: list.apiParams })).data,
    placeholderData: keepPreviousData,
  });
  const columns: Column<AuditLog>[] = [
    { key: "time", header: "Thời gian", cell: (l) => <span className="tabular whitespace-nowrap text-muted">{formatDateTime(l.created_at)}</span> },
    { key: "user", header: "Người thực hiện", cell: (l) => l.user?.full_name ?? <span className="text-muted">Không xác định</span> },
    { key: "action", header: "Hành động", cell: (l) => ACTION_LABELS[l.action] ?? l.action },
    { key: "entity", header: "Đối tượng", cell: (l) => (l.entity_type ? <span className="tabular">{l.entity_type} #{l.entity_id ?? "—"}</span> : "—") },
    { key: "changes", header: "Thay đổi", className: "min-w-72", cell: (l) => <Changes log={l} /> },
    { key: "ip", header: "IP", cell: (l) => <span className="tabular text-xs text-muted">{l.ip_address ?? "—"}</span> },
  ];

  return (
    <>
      <PageHeader title="Nhật ký thao tác" description="Không chứa mật khẩu hay token. Chỉ Admin xem được." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <Select aria-label="Hành động" value={filters.action ?? ""} onChange={(e) => list.setFilter("action", e.target.value || undefined)} className="w-60">
            <option value="">Mọi hành động</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select aria-label="Loại đối tượng" value={filters.entity_type ?? ""} onChange={(e) => list.setFilter("entity_type", e.target.value || undefined)} className="w-48">
            <option value="">Mọi đối tượng</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <DateRangeFilter from={filters.date_from} to={filters.date_to} onChange={list.setFilter} />
        </div>
        <DataTable
          caption="Nhật ký thao tác"
          columns={columns}
          rows={data?.items}
          rowKey={(l) => l.id}
          isPending={isPending}
          isFetching={isFetching}
          error={error}
          onRetry={() => refetch()}
          emptyTitle="Không có bản ghi phù hợp"
        />
        {data && data.total > 0 && (
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        )}
      </Card>
    </>
  );
}
