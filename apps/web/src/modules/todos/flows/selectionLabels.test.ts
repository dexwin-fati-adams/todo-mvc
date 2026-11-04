import { describe, expect, it } from "vitest";
import {
  allSelected,
  isAtLimit,
  SELECTION_LIMIT,
  type SelectionState,
  selectedCount,
} from "./selectionReducer";
import {
  selectionCountText,
  selectionNoticeText,
  selectionRowLabel,
  selectVisibleLabel,
  SELECTION_HELP_TEXT,
} from "./selectionLabels";

const on = (selected: readonly string[]): SelectionState => ({
  mode: "on",
  scopeKey: "scope",
  selected,
  notice: null,
});

const ids = (count: number) => Array.from({ length: count }, (_, index) => `id-${index}`);

describe("selection labels", () => {
  // 26
  it("writes the count line for 0, 3, and the limit", () => {
    expect(selectionCountText(0)).toBe("0 of 100 selected");
    expect(selectionCountText(3)).toBe("3 of 100 selected");
    expect(selectionCountText(100)).toBe("100 of 100 selected. Limit reached.");
  });

  // 27
  it("writes the visible-page label for many rows and for one row", () => {
    expect(selectVisibleLabel(20)).toBe("Select all 20 todos on this page");
    expect(selectVisibleLabel(1)).toBe("Select the 1 todo on this page");
  });

  // 28
  it("writes the row label with the title in curly quotes, as plain text", () => {
    expect(selectionRowLabel("Buy milk")).toBe("Select “Buy milk”");
    expect(selectionRowLabel("<b>Bold</b> & more")).toBe("Select “<b>Bold</b> & more”");
  });

  // 29
  it("writes the notice sentences", () => {
    expect(selectionNoticeText({ kind: "limit", skipped: 10 })).toBe(
      "You can select up to 100 todos. 10 todos were not selected.",
    );
    expect(selectionNoticeText({ kind: "limit", skipped: 1 })).toBe(
      "You can select up to 100 todos. 1 todo was not selected.",
    );
    expect(selectionNoticeText({ kind: "scope-cleared" })).toBe(
      "Selection cleared because the status or search changed.",
    );
    expect(selectionNoticeText({ kind: "cleared" })).toBe("Selection cleared.");
  });

  // 30
  it("has the help text", () => {
    expect(SELECTION_HELP_TEXT).toBe("Selecting a todo does not change whether it is complete.");
  });

  // 31
  describe("readers", () => {
    it("isAtLimit is true only at the limit", () => {
      expect(SELECTION_LIMIT).toBe(100);
      expect(isAtLimit(on(ids(99)))).toBe(false);
      expect(isAtLimit(on(ids(100)))).toBe(true);
      expect(isAtLimit({ mode: "off" })).toBe(false);
    });

    it("selectedCount counts the selected ids, and is 0 while off", () => {
      expect(selectedCount(on(ids(3)))).toBe(3);
      expect(selectedCount({ mode: "off" })).toBe(0);
    });

    it("allSelected is true only when every given id is selected", () => {
      expect(allSelected(["id-0", "id-1"], on(ids(3)))).toBe(true);
      expect(allSelected(["id-0", "other"], on(ids(3)))).toBe(false);
    });

    it("allSelected is false for an empty list and while off", () => {
      expect(allSelected([], on(ids(3)))).toBe(false);
      expect(allSelected(["id-0"], { mode: "off" })).toBe(false);
    });
  });

  // 32
  it("puts the count first and the notice after it", () => {
    expect(selectionCountText(3, { kind: "cleared" })).toBe(
      "3 of 100 selected. Selection cleared.",
    );
    expect(selectionCountText(0, { kind: "scope-cleared" })).toBe(
      "0 of 100 selected. Selection cleared because the status or search changed.",
    );
    expect(selectionCountText(100, { kind: "limit", skipped: 10 })).toBe(
      "100 of 100 selected. Limit reached. You can select up to 100 todos. 10 todos were not selected.",
    );
  });
});
