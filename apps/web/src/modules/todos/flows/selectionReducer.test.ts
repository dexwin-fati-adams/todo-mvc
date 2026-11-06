import { describe, expect, it } from "vitest";
import {
  SELECTION_LIMIT,
  initialSelection,
  selectionReducer,
  type SelectionAction,
  type SelectionState,
} from "@/modules/todos/flows/selectionReducer";

type On = Extract<SelectionState, { mode: "on" }>;

const SCOPE = JSON.stringify(["all", null]);
const OTHER_SCOPE = JSON.stringify(["active", null]);

const on = (selected: readonly string[] = [], extra: Partial<Omit<On, "mode">> = {}): On => ({
  mode: "on",
  scopeKey: SCOPE,
  selected,
  notice: null,
  ...extra,
});

const makeIds = (count: number, prefix = "id"): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);

function asOn(state: SelectionState): On {
  if (state.mode !== "on") {
    throw new Error("Expected selection mode to be on");
  }
  return state;
}

describe("selectionReducer", () => {
  // 1
  it("starts with selection mode off", () => {
    expect(initialSelection).toEqual({ mode: "off" });
  });

  // 2
  it("enter from off turns mode on with the scope key, nothing selected and no notice", () => {
    expect(selectionReducer(initialSelection, { type: "enter", scopeKey: SCOPE })).toEqual({
      mode: "on",
      scopeKey: SCOPE,
      selected: [],
      notice: null,
    });
  });

  // 3
  it("enter while already on returns the same state and keeps the selection", () => {
    const state = on(["a", "b"]);

    const next = selectionReducer(state, { type: "enter", scopeKey: OTHER_SCOPE });

    expect(next).toBe(state);
  });

  // 4
  it("exit from on turns mode off and drops the selection", () => {
    expect(selectionReducer(on(["a", "b"]), { type: "exit" })).toEqual({ mode: "off" });
  });

  // 5
  it("exit while off returns the same state", () => {
    expect(selectionReducer(initialSelection, { type: "exit" })).toBe(initialSelection);
  });

  // 6
  it("toggle adds an unselected id", () => {
    const next = asOn(selectionReducer(on(["a"]), { type: "toggle", id: "b" }));

    expect(next.selected).toEqual(["a", "b"]);
    expect(next.notice).toBeNull();
  });

  // 7
  it("toggle removes a selected id", () => {
    const next = asOn(selectionReducer(on(["a", "b"]), { type: "toggle", id: "a" }));

    expect(next.selected).toEqual(["b"]);
  });

  // 8
  it("toggle keeps the order in which ids were selected", () => {
    const steps: SelectionAction[] = [
      { type: "toggle", id: "c" },
      { type: "toggle", id: "a" },
      { type: "toggle", id: "b" },
    ];

    const result = steps.reduce<SelectionState>(selectionReducer, on());

    expect(asOn(result).selected).toEqual(["c", "a", "b"]);
  });

  // 9
  it("toggle while off returns the same state", () => {
    expect(selectionReducer(initialSelection, { type: "toggle", id: "a" })).toBe(initialSelection);
  });

  // 10
  it("toggle at the limit does not add the id and sets the limit notice for one todo", () => {
    const full = on(makeIds(SELECTION_LIMIT));

    const next = asOn(selectionReducer(full, { type: "toggle", id: "extra" }));

    expect(next.selected).toEqual(full.selected);
    expect(next.selected).toHaveLength(SELECTION_LIMIT);
    expect(next.notice).toEqual({ kind: "limit", skipped: 1 });
  });

  // 11
  it("at the limit a selected id can still be removed, and then another id can be added", () => {
    const full = on(makeIds(SELECTION_LIMIT));

    const afterRemove = asOn(selectionReducer(full, { type: "toggle", id: "id-1" }));
    expect(afterRemove.selected).toHaveLength(SELECTION_LIMIT - 1);
    expect(afterRemove.selected).not.toContain("id-1");

    const afterAdd = asOn(selectionReducer(afterRemove, { type: "toggle", id: "extra" }));
    expect(afterAdd.selected).toHaveLength(SELECTION_LIMIT);
    expect(afterAdd.selected).toContain("extra");
  });

  // 12
  it("selectVisible adds ids in page order, skips selected ones and adds no duplicates", () => {
    const next = asOn(
      selectionReducer(on(["b"]), { type: "selectVisible", ids: ["a", "b", "c", "a"] }),
    );

    expect(next.selected).toEqual(["b", "a", "c"]);
    expect(next.notice).toBeNull();
  });

  // 13
  it("selectVisible past the limit selects what fits and says how many were left out", () => {
    const start = on(makeIds(90));

    const next = asOn(selectionReducer(start, { type: "selectVisible", ids: makeIds(20, "new") }));

    expect(next.selected).toEqual([...makeIds(90), ...makeIds(10, "new")]);
    expect(next.notice).toEqual({ kind: "limit", skipped: 10 });
  });

  // 14
  it("selectVisible when every id is already selected returns the same state", () => {
    const state = on(["a", "b"]);

    expect(selectionReducer(state, { type: "selectVisible", ids: ["a", "b"] })).toBe(state);
  });

  // 15
  it("selectVisible while off returns the same state", () => {
    expect(selectionReducer(initialSelection, { type: "selectVisible", ids: ["a"] })).toBe(
      initialSelection,
    );
  });

  // 16
  it("clear empties the selection, keeps mode on and the scope key, and sets the cleared notice", () => {
    expect(selectionReducer(on(["a", "b"]), { type: "clear" })).toEqual({
      mode: "on",
      scopeKey: SCOPE,
      selected: [],
      notice: { kind: "cleared" },
    });
  });

  // 17
  it("clear with nothing selected returns the same state", () => {
    const state = on();

    expect(selectionReducer(state, { type: "clear" })).toBe(state);
  });

  // 18
  it("scopeChanged with a different key empties the selection and sets the scope notice", () => {
    expect(selectionReducer(on(["a"]), { type: "scopeChanged", scopeKey: OTHER_SCOPE })).toEqual({
      mode: "on",
      scopeKey: OTHER_SCOPE,
      selected: [],
      notice: { kind: "scope-cleared" },
    });
  });

  // 19
  it("scopeChanged with a different key and nothing selected stores the key and sets no notice", () => {
    expect(selectionReducer(on(), { type: "scopeChanged", scopeKey: OTHER_SCOPE })).toEqual({
      mode: "on",
      scopeKey: OTHER_SCOPE,
      selected: [],
      notice: null,
    });
  });

  // 20
  it("scopeChanged with the same key returns the same state", () => {
    const state = on(["a"]);

    expect(selectionReducer(state, { type: "scopeChanged", scopeKey: SCOPE })).toBe(state);
  });

  // 21
  it("scopeChanged while off returns the same state", () => {
    expect(
      selectionReducer(initialSelection, { type: "scopeChanged", scopeKey: OTHER_SCOPE }),
    ).toBe(initialSelection);
  });

  // 22
  it("removed drops the id, and an unknown id returns the same state", () => {
    const state = on(["a", "b"]);

    const next = asOn(selectionReducer(state, { type: "removed", id: "a" }));
    expect(next.selected).toEqual(["b"]);
    expect(next.notice).toBeNull();

    expect(selectionReducer(state, { type: "removed", id: "unknown" })).toBe(state);
  });

  // 23
  it("a change replaces the previous notice, so a notice shows only once", () => {
    const afterCleared = on(["a"], { notice: { kind: "cleared" } });
    expect(asOn(selectionReducer(afterCleared, { type: "toggle", id: "b" })).notice).toBeNull();

    const afterLimit = on(makeIds(SELECTION_LIMIT), { notice: { kind: "limit", skipped: 3 } });
    expect(asOn(selectionReducer(afterLimit, { type: "toggle", id: "id-1" })).notice).toBeNull();
  });

  // 24
  it("never mutates the state it is given", () => {
    const frozen = Object.freeze(on(["a", "b"], { selected: Object.freeze(["a", "b"]) }));
    const actions: SelectionAction[] = [
      { type: "toggle", id: "c" },
      { type: "toggle", id: "a" },
      { type: "selectVisible", ids: ["x", "y"] },
      { type: "clear" },
      { type: "removed", id: "a" },
      { type: "scopeChanged", scopeKey: OTHER_SCOPE },
      { type: "exit" },
    ];

    actions.forEach((action) => {
      expect(() => selectionReducer(frozen, action)).not.toThrow();
    });
    expect(frozen.selected).toEqual(["a", "b"]);
  });

  // 25
  it("has a limit of 100", () => {
    expect(SELECTION_LIMIT).toBe(100);
  });
});

describe("selectionReducer: review fixes", () => {
  it("removed keeps a notice that still applies", () => {
    const state = on(["a", "b"], { notice: { kind: "limit", skipped: 3 } });

    const next = asOn(selectionReducer(state, { type: "removed", id: "a" }));

    expect(next.selected).toEqual(["b"]);
    expect(next.notice).toEqual({ kind: "limit", skipped: 3 });
  });
});
