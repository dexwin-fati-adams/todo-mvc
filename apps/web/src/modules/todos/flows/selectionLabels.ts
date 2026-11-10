import { match } from "ts-pattern";
import { SELECTION_LIMIT, type SelectionNotice } from "./selectionReducer";

// Every sentence the selection controls show lives here, so one test pins each one.
export const ENTER_LABEL = "Select todos";
export const EXIT_LABEL = "Done selecting";
export const GROUP_LABEL = "Selection mode";
export const CLEAR_LABEL = "Clear selection";
export const SELECTION_HELP_TEXT = "Selecting a todo does not change whether it is complete.";

// "Select all 20 todos on this page" for many rows, "Select the 1 todo on this page" for one.
export function selectVisibleLabel(count: number): string {
  return count === 1 ? "Select the 1 todo on this page" : `Select all ${count} todos on this page`;
}

// The title is plain text inside curly quotes. It is never treated as HTML.
export function selectionRowLabel(title: string): string {
  return `Select “${title}”`;
}

export function selectionNoticeText(notice: SelectionNotice): string {
  return (
    match(notice)
      .with({ kind: "limit" }, ({ skipped }) =>
        skipped === 1
          ? `You can select up to ${SELECTION_LIMIT} todos. 1 todo was not selected.`
          : `You can select up to ${SELECTION_LIMIT} todos. ${skipped} todos were not selected.`,
      )
      .with(
        { kind: "scope-cleared" },
        () => "Selection cleared because the status or search changed.",
      )
      .with({ kind: "cleared" }, () => "Selection cleared.")
      // PLACEHOLDERS (red phase): replaced by the real sentences.
      .with({ kind: "updated" }, () => "")
      .with({ kind: "conflict" }, () => "")
      .exhaustive()
  );
}

// The count comes first. At the limit it says so. A notice, if there is one, comes last.
export function selectionCountText(count: number, notice: SelectionNotice | null = null): string {
  const base =
    count >= SELECTION_LIMIT
      ? `${count} of ${SELECTION_LIMIT} selected. Limit reached.`
      : `${count} of ${SELECTION_LIMIT} selected`;

  if (notice === null) {
    return base;
  }

  const sentence = selectionNoticeText(notice);
  return base.endsWith(".") ? `${base} ${sentence}` : `${base}. ${sentence}`;
}

// ---- Update selected todos: PLACEHOLDERS (red phase), replaced by the real sentences ----
export const UPDATE_FAILURE_TEXT = "";
export const UPDATE_HELP_TEXT = "";

export function markCompleteLabel(count: number): string {
  void count;
  return "";
}

export function markActiveLabel(count: number): string {
  void count;
  return "";
}

export function updatingText(count: number): string {
  void count;
  return "";
}
