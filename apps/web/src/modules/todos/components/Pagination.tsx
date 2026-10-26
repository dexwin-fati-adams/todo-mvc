import { useId, useLayoutEffect, useRef } from "react";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/modules/todos/flows/pageSize";

export type PaginationProps = {
  page: number;
  totalPages: number | null; // null = no known count yet
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
};

//The ring shows a blue outline around a button when you use the keyboard to focus on it.
const ring =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

// Same look as the status filter links and the Delete button: slate border, small text.
const pageButton =
  "rounded border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 " +
  "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white";

export function Pagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const selectId = useId();
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const focused = useRef<"previous" | "next" | null>(null);

  const pages = totalPages === null ? null : Math.max(totalPages, 1);
  //A page past the last page is not valid yet. TodoFlows replaces it, so until then show "Page X" and block Previous.
  const pastTheEnd = pages !== null && page > pages;
  const previousDisabled = page <= 1 || pastTheEnd;
  const nextDisabled = pages === null || page >= pages;
  const text = pages === null || pastTheEnd ? `Page ${page}` : `Page ${page} of ${pages}`;

  // If the button that had focus just became disabled, move focus to the page text.
  useLayoutEffect(() => {
    const active = document.activeElement;
    const lostFocus = (button: HTMLButtonElement | null) =>
      active === null || active === document.body || active === button;

    const target = focused.current;
    if (
      (target === "previous" && previousDisabled && lostFocus(previousRef.current)) ||
      (target === "next" && nextDisabled && lostFocus(nextRef.current))
    ) {
      textRef.current?.focus();
      focused.current = null;
    }
  });

  const track = (which: "previous" | "next") => ({
    onFocus: () => {
      focused.current = which;
    },
    // A button that is being disabled blurs with no relatedTarget, so only forget on a real move.
    onBlur: (event: React.FocusEvent) => {
      if (event.relatedTarget !== null) focused.current = null;
    },
  });

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <button
          ref={previousRef}
          type="button"
          disabled={previousDisabled}
          className={`${pageButton} ${ring}`}
          {...track("previous")}
          onClick={() => onPageChange(page - 1)}
        >
          Previous page
        </button>
        <span
          ref={textRef}
          tabIndex={-1}
          aria-live="polite"
          className={`min-w-24 rounded text-center text-sm text-slate-700 ${ring}`}
        >
          {text}
        </span>
        <button
          ref={nextRef}
          type="button"
          disabled={nextDisabled}
          className={`${pageButton} ${ring}`}
          {...track("next")}
          onClick={() => onPageChange(page + 1)}
        >
          Next page
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm text-slate-700">
          Todos per page
        </label>
        <select
          id={selectId}
          className={`rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 ${ring}`}
          value={pageSize}
          onChange={(event) => {
            const chosen = PAGE_SIZE_OPTIONS.find((size) => size === Number(event.target.value));
            if (chosen !== undefined) onPageSizeChange(chosen);
          }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
