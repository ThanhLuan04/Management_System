import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Spinner";
import { PAGE_SIZES } from "@/hooks/useListParams";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";

import { EmptyState, ErrorState } from "./States";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Tên trường sắp xếp phía backend; có thì tiêu đề cột bấm được */
  sortKey?: string;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  isPending: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  sort?: string;
  onSort?: (sort: string) => void;
  emptyTitle: string;
  emptyAction?: ReactNode;
  caption: string;
}

function SortIcon({ active, descending }: { active: boolean; descending: boolean }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
  return descending ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden />;
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" };

/** Bảng dữ liệu: tiêu đề sắp xếp được, trạng thái tải/rỗng/lỗi; tải lại giữ dữ liệu cũ (mờ) thay vì nháy. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isPending,
  isFetching,
  error,
  onRetry,
  sort,
  onSort,
  emptyTitle,
  emptyAction,
  caption,
}: DataTableProps<T>) {
  if (error && !rows) return <ErrorState error={error} onRetry={onRetry} />;

  const sortField = sort?.replace(/^-/, "");
  const descending = sort?.startsWith("-") ?? false;

  return (
    <div className={cn("overflow-x-auto transition-opacity", isFetching && !isPending && "opacity-60")} aria-busy={isFetching}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-surface-hover text-xs font-semibold text-muted">
          <tr>
            {columns.map((column) => {
              const sortable = column.sortKey && onSort;
              const active = sortField === column.sortKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (descending ? "descending" : "ascending") : undefined}
                  className={cn("px-4 py-2.5 font-medium whitespace-nowrap", alignClass[column.align ?? "left"], column.className)}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(active && !descending ? `-${column.sortKey}` : column.sortKey!)}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                    >
                      {column.header}
                      <SortIcon active={active} descending={descending} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <Skeleton className="h-4" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={rowKey(row)} className="h-11 hover:bg-surface-hover">
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-4 py-2", alignClass[column.align ?? "left"], column.className)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!isPending && rows?.length === 0 && <EmptyState title={emptyTitle} action={emptyAction} />}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <p className="text-muted">
        Hiển thị <span className="tabular font-medium text-foreground">{formatNumber(from)}–{formatNumber(to)}</span> /{" "}
        <span className="tabular font-medium text-foreground">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-muted">
          <span className="hidden sm:inline">Mỗi trang</span>
          <Select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 w-20"
            aria-label="Số dòng mỗi trang"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <nav aria-label="Phân trang" className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md border border-border p-1.5 hover:bg-surface-hover disabled:opacity-40"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular px-2">
            {page} / {pages}
          </span>
          <button
            type="button"
            className="rounded-md border border-border p-1.5 hover:bg-surface-hover disabled:opacity-40"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </div>
  );
}
