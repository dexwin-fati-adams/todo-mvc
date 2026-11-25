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
  return match(notice)
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
    .with({ kind: "updated" }, ({ count, completed }) => updatedSentence(count, completed))
    .with({ kind: "conflict" }, ({ removed }) => conflictSentence(removed))
    .with({ kind: "deleted" }, ({ count }) => deletedSentence(count))
    .with({ kind: "delete-conflict" }, ({ removed }) => deleteConflictSentence(removed))
    .exhaustive();
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

// ---- Update selected todos ----
export const UPDATE_FAILURE_TEXT = "Could not update the selected todos. Please try again.";
export const UPDATE_HELP_TEXT = "Changes only the selected todos, on every page.";

function todoWord(count: number): string {
  return count === 1 ? "todo" : "todos";
}

export function markCompleteLabel(count: number): string {
  return `Mark ${count} selected ${todoWord(count)} as complete`;
}

export function markActiveLabel(count: number): string {
  return `Mark ${count} selected ${todoWord(count)} as active`;
}

export function updatingText(count: number): string {
  return `Updating ${count} selected ${todoWord(count)}…`;
}

function updatedSentence(count: number, completed: boolean): string {
  return `Marked ${count} selected ${todoWord(count)} as ${completed ? "complete" : "active"}.`;
}

function conflictSentence(removed: number): string {
  return removed === 1
    ? "Nothing was changed. 1 selected todo no longer exists and was removed from the selection."
    : `Nothing was changed. ${removed} selected todos no longer exist and were removed from the selection.`;
}

// ---- Delete selected todos ----
export const DELETE_FAILURE_TEXT = "Could not delete the selected todos. Please try again.";
export const DELETE_HELP_TEXT = "Deleting cannot be undone.";
export const CANCEL_DELETE_LABEL = "Cancel";

export function deleteLabel(count: number): string {
  return `Delete ${count} selected ${todoWord(count)}`;
}

export function deleteQuestionText(count: number): string {
  return `Delete ${count} selected ${todoWord(count)}? This cannot be undone.`;
}

export function confirmDeleteLabel(count: number): string {
  return `Yes, delete ${count} ${todoWord(count)}`;
}

export function deletingText(count: number): string {
  return `Deleting ${count} selected ${todoWord(count)}…`;
}

function deletedSentence(count: number): string {
  return `Deleted ${count} selected ${todoWord(count)}.`;
}

function deleteConflictSentence(removed: number): string {
  return removed === 1
    ? "Nothing was deleted. 1 selected todo no longer exists and was removed from the selection."
    : `Nothing was deleted. ${removed} selected todos no longer exist and were removed from the selection.`;
}
