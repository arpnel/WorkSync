"use client";

import { Fragment } from "react";
import { Button } from "@/components/ui/button";

export default function AdminPagination({
  page,
  pageSize = 10,
  itemCount,
  onPageChange,
  disabled = false,
}: {
  page: number;
  pageSize?: number;
  itemCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const pageCount = Math.ceil(itemCount / pageSize);
  const currentPage = pageCount ? Math.min(Math.max(1, page + 1), pageCount) : 0;
  const pages = pageCount <= 7
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])]
        .filter((number) => number >= 1 && number <= pageCount)
        .sort((a, b) => a - b);

  if (!pageCount) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 border-t pt-4">
      <Button type="button" size="sm" variant="outline" disabled={disabled || currentPage <= 1} onClick={() => onPageChange(0)}>First</Button>
      <Button type="button" size="sm" variant="outline" aria-label="Previous page" disabled={disabled || currentPage <= 1} onClick={() => onPageChange(currentPage - 2)}>Previous</Button>
      {pages.map((number, index) => (
        <Fragment key={number}>
          {index > 0 && number - pages[index - 1] > 1 && <span className="px-1 text-muted-foreground" aria-hidden="true">…</span>}
          <Button type="button" size="sm" variant={number === currentPage ? "default" : "outline"} aria-label={`Page ${number}`} aria-current={number === currentPage ? "page" : undefined} disabled={disabled} onClick={() => onPageChange(number - 1)}>{number}</Button>
        </Fragment>
      ))}
      <Button type="button" size="sm" variant="outline" aria-label="Next page" disabled={disabled || currentPage >= pageCount} onClick={() => onPageChange(currentPage)}>Next</Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled || currentPage >= pageCount} onClick={() => onPageChange(pageCount - 1)}>Last</Button>
    </div>
  );
}
