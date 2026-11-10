import { describe, expect, it } from "vitest";
import { BATCH_MAX_IDS } from "contracts";
import {
  SELECTION_LIMIT,
  initialSelection,
  selectionReducer,
  type SelectionState,
} from "@/modules/todos/flows/selectionReducer";

type On = Extract<SelectionState, { mode: "on" }>;

const SCOPE = JSON.stringify(["all", null]);

const on = (selected: readonly string[] = [], extra: Partial<Omit<On, "mode">> = {}): On => ({
  mode: "on",
  scopeKey: SCOPE,
  selected,
  notice: null,
  ...extra,
});

describe("selectionReducer: updated", () => {
  // 50
  it("empties the selection, keeps mode on and the scope key, and sets the updated notice", () => {
    const next = selectionReducer(on(["a", "b", "c"]), {
      type: "updated",
      count: 3,
      completed: true,
    });

    expect(next).toEqual({
      mode: "on",
      scopeKey: SCOPE,
      selected: [],
      notice: { kind: "updated", count: 3, completed: true },
    });
  });

  it("records the direction, and replaces an older notice", () => {
    const next = selectionReducer(on(["a"], { notice: { kind: "limit", skipped: 2 } }), {
      type: "updated",
      count: 1,
      completed: false,
    });

    expect(next).toMatchObject({
      selected: [],
      notice: { kind: "updated", count: 1, completed: false },
    });
  });

  // 53
  it("returns the same state while selection mode is off", () => {
    expect(selectionReducer(initialSelection, { type: "updated", count: 2, completed: true })).toBe(
      initialSelection,
    );
  });
});

describe("selectionReducer: conflict", () => {
  // 51
  it("removes only the ids that are selected and named missing, keeps the order, and counts them", () => {
    const state = on(["a", "b", "c", "d"]);

    const next = selectionReducer(state, { type: "conflict", missingIds: ["d", "b", "zzz"] });

    expect(next).toEqual({
      mode: "on",
      scopeKey: SCOPE,
      selected: ["a", "c"],
      notice: { kind: "conflict", removed: 2 },
    });
    expect(state.selected).toEqual(["a", "b", "c", "d"]);
  });

  it("empties the selection when every selected id is missing", () => {
    const next = selectionReducer(on(["a", "b"]), { type: "conflict", missingIds: ["a", "b"] });

    expect(next).toMatchObject({ selected: [], notice: { kind: "conflict", removed: 2 } });
  });

  // 52
  it("returns the same state when none of the named ids is selected", () => {
    const state = on(["a", "b"]);

    expect(selectionReducer(state, { type: "conflict", missingIds: ["x", "y"] })).toBe(state);
  });

  // 53
  it("returns the same state while selection mode is off", () => {
    expect(selectionReducer(initialSelection, { type: "conflict", missingIds: ["a"] })).toBe(
      initialSelection,
    );
  });
});

// 54
describe("selection limit", () => {
  it("equals the number of ids the batch contract accepts", () => {
    expect(SELECTION_LIMIT).toBe(BATCH_MAX_IDS);
  });
});
