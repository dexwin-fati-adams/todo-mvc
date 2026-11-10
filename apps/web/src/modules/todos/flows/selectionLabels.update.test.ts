import { describe, expect, it } from "vitest";
import {
  UPDATE_FAILURE_TEXT,
  UPDATE_HELP_TEXT,
  markActiveLabel,
  markCompleteLabel,
  selectionCountText,
  selectionNoticeText,
  updatingText,
} from "@/modules/todos/flows/selectionLabels";

describe("update selected labels", () => {
  // 55
  it("writes the two action labels, plural and singular", () => {
    expect(markCompleteLabel(3)).toBe("Mark 3 selected todos as complete");
    expect(markCompleteLabel(1)).toBe("Mark 1 selected todo as complete");
    expect(markActiveLabel(3)).toBe("Mark 3 selected todos as active");
    expect(markActiveLabel(1)).toBe("Mark 1 selected todo as active");
  });

  // 56
  it("writes the pending text, plural and singular", () => {
    expect(updatingText(3)).toBe("Updating 3 selected todos…");
    expect(updatingText(1)).toBe("Updating 1 selected todo…");
  });

  // 57
  it("writes the success sentences for complete and active, plural and singular", () => {
    expect(selectionNoticeText({ kind: "updated", count: 3, completed: true })).toBe(
      "Marked 3 selected todos as complete.",
    );
    expect(selectionNoticeText({ kind: "updated", count: 1, completed: true })).toBe(
      "Marked 1 selected todo as complete.",
    );
    expect(selectionNoticeText({ kind: "updated", count: 3, completed: false })).toBe(
      "Marked 3 selected todos as active.",
    );
    expect(selectionNoticeText({ kind: "updated", count: 1, completed: false })).toBe(
      "Marked 1 selected todo as active.",
    );
  });

  // 58
  it("writes the conflict sentence, plural and singular", () => {
    expect(selectionNoticeText({ kind: "conflict", removed: 2 })).toBe(
      "Nothing was changed. 2 selected todos no longer exist and were removed from the selection.",
    );
    expect(selectionNoticeText({ kind: "conflict", removed: 1 })).toBe(
      "Nothing was changed. 1 selected todo no longer exists and was removed from the selection.",
    );
  });

  // 59
  it("pins the failure sentence and the help text exactly", () => {
    expect(UPDATE_FAILURE_TEXT).toBe("Could not update the selected todos. Please try again.");
    expect(UPDATE_HELP_TEXT).toBe("Changes only the selected todos, on every page.");
  });

  // 60
  it("puts the count first in the count line, then the notice", () => {
    expect(selectionCountText(0, { kind: "updated", count: 3, completed: true })).toBe(
      "0 of 100 selected. Marked 3 selected todos as complete.",
    );
    expect(selectionCountText(2, { kind: "conflict", removed: 1 })).toBe(
      "2 of 100 selected. Nothing was changed. 1 selected todo no longer exists and was removed from the selection.",
    );
  });
});
