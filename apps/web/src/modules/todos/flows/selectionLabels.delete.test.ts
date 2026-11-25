import { describe, expect, it } from "vitest";
import {
  CANCEL_DELETE_LABEL,
  DELETE_FAILURE_TEXT,
  DELETE_HELP_TEXT,
  confirmDeleteLabel,
  deleteLabel,
  deleteQuestionText,
  deletingText,
  selectionCountText,
  selectionNoticeText,
} from "./selectionLabels";

// 30
describe("delete labels", () => {
  it("has the exact fixed sentences", () => {
    expect(DELETE_HELP_TEXT).toBe("Deleting cannot be undone.");
    expect(CANCEL_DELETE_LABEL).toBe("Cancel");
    expect(DELETE_FAILURE_TEXT).toBe("Could not delete the selected todos. Please try again.");
  });

  it("delete button, plural and singular", () => {
    expect(deleteLabel(3)).toBe("Delete 3 selected todos");
    expect(deleteLabel(1)).toBe("Delete 1 selected todo");
  });

  it("confirmation question, plural and singular", () => {
    expect(deleteQuestionText(3)).toBe("Delete 3 selected todos? This cannot be undone.");
    expect(deleteQuestionText(1)).toBe("Delete 1 selected todo? This cannot be undone.");
  });

  it("confirm button, plural and singular", () => {
    expect(confirmDeleteLabel(3)).toBe("Yes, delete 3 todos");
    expect(confirmDeleteLabel(1)).toBe("Yes, delete 1 todo");
  });

  it("pending text, plural and singular", () => {
    expect(deletingText(3)).toBe("Deleting 3 selected todos…");
    expect(deletingText(1)).toBe("Deleting 1 selected todo…");
  });

  it("success notice, plural and singular", () => {
    expect(selectionNoticeText({ kind: "deleted", count: 3 })).toBe("Deleted 3 selected todos.");
    expect(selectionNoticeText({ kind: "deleted", count: 1 })).toBe("Deleted 1 selected todo.");
  });

  it("conflict notice, plural and singular", () => {
    expect(selectionNoticeText({ kind: "delete-conflict", removed: 2 })).toBe(
      "Nothing was deleted. 2 selected todos no longer exist and were removed from the selection.",
    );
    expect(selectionNoticeText({ kind: "delete-conflict", removed: 1 })).toBe(
      "Nothing was deleted. 1 selected todo no longer exists and was removed from the selection.",
    );
  });

  it("the count line puts the count first", () => {
    expect(selectionCountText(0, { kind: "deleted", count: 3 })).toBe(
      "0 of 100 selected. Deleted 3 selected todos.",
    );
    expect(selectionCountText(1, { kind: "delete-conflict", removed: 2 })).toBe(
      "1 of 100 selected. Nothing was deleted. 2 selected todos no longer exist and were removed from the selection.",
    );
  });
});
