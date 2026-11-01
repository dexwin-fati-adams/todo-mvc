import { describe, expect, it } from "vitest";
import { chooseToggleAll, isAllCompleted, toggleAllLabel } from "@/modules/todos/flows/toggleAll";

describe("chooseToggleAll", () => {
  // 1
  it("chooses completed: true for a mixed list", () => {
    expect(chooseToggleAll({ activeCount: 3, completedCount: 2 })).toEqual({
      kind: "set",
      completed: true,
    });
  });

  // 2
  it("chooses completed: true when every todo is active", () => {
    expect(chooseToggleAll({ activeCount: 5, completedCount: 0 })).toEqual({
      kind: "set",
      completed: true,
    });
  });

  // 3
  it("chooses completed: false when every todo is completed", () => {
    expect(chooseToggleAll({ activeCount: 0, completedCount: 5 })).toEqual({
      kind: "set",
      completed: false,
    });
  });

  // 4
  it("chooses none when there are no todos", () => {
    expect(chooseToggleAll({ activeCount: 0, completedCount: 0 })).toEqual({ kind: "none" });
  });

  // 5
  it("uses only the two counts, so the same counts always give the same choice", () => {
    const counts = { activeCount: 1, completedCount: 44 };
    expect(chooseToggleAll(counts)).toEqual(chooseToggleAll({ ...counts }));
    expect(chooseToggleAll(counts)).toEqual({ kind: "set", completed: true });
    // chooseToggleAll takes one argument: nothing about the page, status, search or rows can reach it.
    expect(chooseToggleAll.length).toBe(1);
  });
});

describe("isAllCompleted", () => {
  // 6
  it("is true only when nothing is active and something is completed", () => {
    expect(isAllCompleted({ activeCount: 0, completedCount: 5 })).toBe(true);
    expect(isAllCompleted({ activeCount: 1, completedCount: 4 })).toBe(false);
    expect(isAllCompleted({ activeCount: 5, completedCount: 0 })).toBe(false);
    expect(isAllCompleted({ activeCount: 0, completedCount: 0 })).toBe(false);
  });
});

describe("toggleAllLabel", () => {
  // 7
  it("names the whole collection when marking all complete", () => {
    expect(toggleAllLabel({ kind: "set", completed: true }, 45)).toBe(
      "Mark all 45 todos as complete",
    );
  });

  // 8
  it("names the whole collection when marking all active", () => {
    expect(toggleAllLabel({ kind: "set", completed: false }, 45)).toBe(
      "Mark all 45 todos as active",
    );
  });

  // 9
  it("uses singular wording for one todo", () => {
    expect(toggleAllLabel({ kind: "set", completed: true }, 1)).toBe("Mark the 1 todo as complete");
    expect(toggleAllLabel({ kind: "set", completed: false }, 1)).toBe("Mark the 1 todo as active");
  });

  // 10
  it("uses the total it is given, not a page size", () => {
    // 45 todos in total, even though a page only shows 20 of them.
    expect(toggleAllLabel({ kind: "set", completed: true }, 45)).toContain("45");
    expect(toggleAllLabel({ kind: "set", completed: true }, 45)).not.toContain("20");
  });

  it("has no label when there is nothing to do", () => {
    expect(toggleAllLabel({ kind: "none" }, 0)).toBe("");
  });
});
