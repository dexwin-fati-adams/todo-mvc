import { describe, expect, it } from "vitest";
import { selectionReducer, type SelectionNotice, type SelectionState } from "./selectionReducer";

const on = (selected: string[], notice: SelectionNotice | null = null): SelectionState => ({
  mode: "on",
  scopeKey: "all|",
  selected,
  notice,
});

describe("selectionReducer: deleted", () => {
  // 27
  it("empties the selection, keeps mode and scope, and sets the deleted notice", () => {
    const next = selectionReducer(on(["a", "b", "c"]), { type: "deleted", count: 3 });
    expect(next).toEqual({
      mode: "on",
      scopeKey: "all|",
      selected: [],
      notice: { kind: "deleted", count: 3 },
    });
  });

  it("uses the count it is given, not the selection length", () => {
    const next = selectionReducer(on(["a", "b"]), { type: "deleted", count: 5 });
    expect(next).toMatchObject({ notice: { kind: "deleted", count: 5 } });
  });
});

describe("selectionReducer: deleteConflict", () => {
  // 28
  it("removes only ids that are selected and missing, keeps order, and counts them", () => {
    const next = selectionReducer(on(["a", "b", "c", "d"]), {
      type: "deleteConflict",
      missingIds: ["c", "a", "zzz"],
    });
    expect(next).toEqual({
      mode: "on",
      scopeKey: "all|",
      selected: ["b", "d"],
      notice: { kind: "delete-conflict", removed: 2 },
    });
  });

  it("can remove every selected id", () => {
    const next = selectionReducer(on(["a", "b"]), {
      type: "deleteConflict",
      missingIds: ["a", "b"],
    });
    expect(next).toMatchObject({
      selected: [],
      notice: { kind: "delete-conflict", removed: 2 },
    });
  });

  // 29
  it("returns the same state when no missing id is selected", () => {
    const state = on(["a", "b"]);
    expect(selectionReducer(state, { type: "deleteConflict", missingIds: ["x"] })).toBe(state);
  });

  it("returns the same state while selection mode is off", () => {
    const off: SelectionState = { mode: "off" };
    expect(selectionReducer(off, { type: "deleted", count: 2 })).toBe(off);
    expect(selectionReducer(off, { type: "deleteConflict", missingIds: ["a"] })).toBe(off);
  });
});
