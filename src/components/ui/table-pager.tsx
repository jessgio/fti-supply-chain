"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

export const TABLE_PAGE_SIZE = 40;

export function usePagedItems<T>(
  items: T[],
  resetKey: string,
  pageSize = TABLE_PAGE_SIZE,
) {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const page = state.key === resetKey ? state.page : 0;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;

  const setPage = useCallback(
    (next: number) => {
      setState({ key: resetKey, page: next });
    },
    [resetKey],
  );

  return {
    page: safePage,
    pageCount,
    start,
    slice: items.slice(start, start + pageSize),
    total: items.length,
    pageSize,
    setPage,
  };
}

export function TablePager({
  page,
  pageCount,
  start,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  start: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(start + pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-stone-600">
      <p>
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
