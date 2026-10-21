import type { MouseEvent } from "react";
import { match } from "ts-pattern";
import type { Status } from "contracts";
import type { TodoCounts } from "@/modules/todos/hooks/useTodos";

type StatusFilterProps = {
  status: Status;
  counts: TodoCounts | null;
  onSelect: (status: Status) => void;
  hrefFor?: (status: Status) => string;
};

const OPTIONS = [
  { status: "all", label: "All", href: "?" },
  { status: "active", label: "Active", href: "?status=active" },
  { status: "completed", label: "Completed", href: "?status=completed" },
] as const satisfies ReadonlyArray<{ status: Status; label: string; href: string }>;

//This function returns the number of todos for the selected status, such as all,
//  active, or completed; if the counts are missing (null), it returns null.
function countFor(status: Status, counts: TodoCounts | null): number | null {
  if (counts === null) {
    return null;
  }
  return match(status)
    .with("all", () => counts.active + counts.completed)
    .with("active", () => counts.active)
    .with("completed", () => counts.completed)
    .exhaustive();
}

export function StatusFilter({ status, counts, onSelect, hrefFor }: StatusFilterProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, next: Status) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onSelect(next);
  };

  return (
    <nav aria-label="Filter todos" className="mb-3 flex gap-2">
      {OPTIONS.map((option) => {
        const selected = option.status === status;
        const count = countFor(option.status, counts);
        return (
          <a
            key={option.status}
            href={hrefFor === undefined ? option.href : hrefFor(option.status)}
            aria-current={selected ? "page" : undefined}
            onClick={(event) => handleClick(event, option.status)}
            className={`rounded border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              selected
                ? "border-slate-900 bg-slate-100 font-semibold text-slate-900"
                : "border-transparent text-slate-700"
            }`}
          >
            {option.label}
            {count === null ? null : (
              <>
                {" "}
                <span className="text-slate-600">({count})</span>
              </>
            )}
          </a>
        );
      })}
    </nav>
  );
}
