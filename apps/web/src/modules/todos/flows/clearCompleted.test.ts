import { describe, expect, it } from "vitest";
import { chooseClearCompleted, clearCompletedLabel } from "@/modules/todos/flows/clearCompleted";

describe("chooseClearCompleted", () => {
  // 1
  it("chooses clear, with the completed count, when something is completed", () => {
    expect(chooseClearCompleted({ activeCount: 4, completedCount: 3 })).toEqual({
      kind: "clear",
      count: 3,
    });
  });

  // 2
  it("chooses none when nothing is completed, whatever the active count is", () => {
    expect(chooseClearCompleted({ activeCount: 5, completedCount: 0 })).toEqual({ kind: "none" });
    expect(chooseClearCompleted({ activeCount: 0, completedCount: 0 })).toEqual({ kind: "none" });
  });

  // 3
  it("chooses none when there are no todos at all", () => {
    expect(chooseClearCompleted({ activeCount: 0, completedCount: 0 })).toEqual({ kind: "none" });
  });

  it("chooses clear when every todo is completed", () => {
    expect(chooseClearCompleted({ activeCount: 0, completedCount: 5 })).toEqual({
      kind: "clear",
      count: 5,
    });
  });

  // 4
  it("uses only the counts, so the same counts always give the same choice", () => {
    const counts = { activeCount: 25, completedCount: 20 };
    expect(chooseClearCompleted(counts)).toEqual(chooseClearCompleted({ ...counts }));
    // One argument only: nothing about the page, status, search or rows can reach it.
    expect(chooseClearCompleted.length).toBe(1);
  });
});

describe("clearCompletedLabel", () => {
  // 5
  it("names the whole collection for many completed todos", () => {
    expect(clearCompletedLabel({ kind: "clear", count: 20 })).toBe("Clear all 20 completed todos");
  });

  // 6
  it("uses singular wording for one completed todo", () => {
    expect(clearCompletedLabel({ kind: "clear", count: 1 })).toBe("Clear the 1 completed todo");
  });

  // 7
  it("uses the total it is given, not a page size", () => {
    // 45 completed todos in total, even though a page only shows 20 of them.
    const label = clearCompletedLabel({ kind: "clear", count: 45 });
    expect(label).toContain("45");
    expect(label).not.toContain("20");
  });

  // 8
  it("has no label when there is nothing to clear", () => {
    expect(clearCompletedLabel({ kind: "none" })).toBe("");
  });
});
