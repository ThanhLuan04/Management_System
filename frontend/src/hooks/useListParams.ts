import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export interface ListState {
  page: number;
  page_size: number;
  sort: string | undefined;
  /** Các tham số lọc khác (q, category_id, is_active...) dạng chuỗi như trên URL */
  filters: Record<string, string>;
}

/**
 * Trạng thái danh sách (trang, sắp xếp, tìm kiếm, bộ lọc) lưu trên URL:
 * tải lại trang / chia sẻ link giữ nguyên; đổi bộ lọc tự quay về trang 1.
 */
export function useListParams(defaultSort?: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const state: ListState = useMemo(() => {
    const filters: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (!["page", "page_size", "sort"].includes(key) && value !== "") filters[key] = value;
    });
    const size = Number(searchParams.get("page_size"));
    return {
      page: Math.max(1, Number(searchParams.get("page")) || 1),
      page_size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
      sort: searchParams.get("sort") ?? defaultSort,
      filters,
    };
  }, [searchParams, defaultSort]);

  const update = useCallback(
    (changes: Record<string, string | number | undefined | null>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === null || value === "") next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage && !("page" in changes)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** Tham số gửi API: chỉ gồm giá trị có nội dung. */
  const apiParams = useMemo(
    () => ({ page: state.page, page_size: state.page_size, sort: state.sort, ...state.filters }),
    [state],
  );

  return {
    state,
    apiParams,
    setFilter: (key: string, value: string | undefined) => update({ [key]: value }),
    setPage: (page: number) => update({ page }, false),
    setPageSize: (size: number) => update({ page_size: size }),
    setSort: (sort: string) => update({ sort }),
    reset: () => setSearchParams(new URLSearchParams(), { replace: true }),
  };
}
