import { match } from "ts-pattern";

//The most todos that can be selected at once.
export const SELECTION_LIMIT = 100;

export type SelectionNotice =
  | { kind: "limit"; skipped: number }
  | { kind: "scope-cleared" }
  | { kind: "cleared" }
  | { kind: "updated"; count: number; completed: boolean }
  | { kind: "conflict"; removed: number };

export type SelectionState =
  | { mode: "off" }
  | {
      mode: "on";
      scopeKey: string;
      selected: readonly string[];
      notice: SelectionNotice | null;
    };

export type SelectionAction =
  | { type: "enter"; scopeKey: string }
  | { type: "exit" }
  | { type: "toggle"; id: string }
  | { type: "selectVisible"; ids: readonly string[] }
  | { type: "clear" }
  | { type: "scopeChanged"; scopeKey: string }
  | { type: "removed"; id: string }
  | { type: "updated"; count: number; completed: boolean }
  | { type: "conflict"; missingIds: readonly string[] };

type SelectionOn = Extract<SelectionState, { mode: "on" }>;

export const initialSelection: SelectionState = { mode: "off" };

//A selected id is removed. An unselected id is added, unless 100 are selected: then it is left out and the notice says so.
function toggleId(state: SelectionOn, id: string): SelectionOn {
  if (state.selected.includes(id)) {
    return {
      ...state,
      selected: state.selected.filter((selectedId) => selectedId !== id),
      notice: null,
    };
  }
  if (state.selected.length >= SELECTION_LIMIT) {
    return { ...state, notice: { kind: "limit", skipped: 1 } };
  }
  return { ...state, selected: [...state.selected, id], notice: null };
}

//Adds the ids that are not selected yet, in the order given, until 100. The notice says how many did not fit.
function selectPage(state: SelectionOn, ids: readonly string[]): SelectionOn {
  const alreadySelected = new Set(state.selected);
  const fresh = [...new Set(ids)].filter((id) => !alreadySelected.has(id));
  if (fresh.length === 0) {
    return state;
  }
  const room = Math.max(0, SELECTION_LIMIT - state.selected.length);
  const added = fresh.slice(0, room);
  const skipped = fresh.length - added.length;
  return {
    ...state,
    selected: [...state.selected, ...added],
    notice: skipped > 0 ? { kind: "limit", skipped } : null,
  };
}

function clearAll(state: SelectionOn): SelectionOn {
  if (state.selected.length === 0) {
    return state;
  }
  return { ...state, selected: [], notice: { kind: "cleared" } };
}

//A new status or search is a new scope: the selection is emptied, and the user is told only if something was selected.
function changeScope(state: SelectionOn, scopeKey: string): SelectionOn {
  if (state.scopeKey === scopeKey) {
    return state;
  }
  return {
    mode: "on",
    scopeKey,
    selected: [],
    notice: state.selected.length > 0 ? { kind: "scope-cleared" } : null,
  };
}

function removeId(state: SelectionOn, id: string): SelectionOn {
  if (!state.selected.includes(id)) {
    return state;
  }
  //The notice stays: a finished delete does not make "Limit reached" or "Selection cleared" untrue.
  return { ...state, selected: state.selected.filter((selectedId) => selectedId !== id) };
}

//A finished update empties the selection and keeps the mode on. The notice carries the server's count and the direction.
function applyUpdated(state: SelectionOn, count: number, completed: boolean): SelectionOn {
  return { ...state, selected: [], notice: { kind: "updated", count, completed } };
}

//A conflict removes only the ids that are both selected and named as missing. The rest keep their order.
//If none of the named ids is selected, nothing changes and the same state comes back.
function applyConflict(state: SelectionOn, missingIds: readonly string[]): SelectionOn {
  const missing = new Set(missingIds);
  const remaining = state.selected.filter((id) => !missing.has(id));
  const removed = state.selected.length - remaining.length;
  if (removed === 0) {
    return state;
  }
  return { ...state, selected: remaining, notice: { kind: "conflict", removed } };
}

//Every rule for selection mode lives here. It is pure, it never mutates its input,
// and it returns the same state object when nothing changes. Both matches are exhaustive,
// so a new state or action that is not handled is a compile error and not a runtime surprise.
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  return match<SelectionState, SelectionState>(state)
    .with({ mode: "off" }, (off) =>
      match<SelectionAction, SelectionState>(action)
        .with({ type: "enter" }, ({ scopeKey }) => ({
          mode: "on",
          scopeKey,
          selected: [],
          notice: null,
        }))
        .with(
          { type: "exit" },
          { type: "toggle" },
          { type: "selectVisible" },
          { type: "clear" },
          { type: "scopeChanged" },
          { type: "removed" },
          { type: "updated" },
          { type: "conflict" },
          () => off,
        )
        .exhaustive(),
    )
    .with({ mode: "on" }, (current) =>
      match<SelectionAction, SelectionState>(action)
        .with({ type: "enter" }, () => current)
        .with({ type: "exit" }, () => initialSelection)
        .with({ type: "toggle" }, ({ id }) => toggleId(current, id))
        .with({ type: "selectVisible" }, ({ ids }) => selectPage(current, ids))
        .with({ type: "clear" }, () => clearAll(current))
        .with({ type: "scopeChanged" }, ({ scopeKey }) => changeScope(current, scopeKey))
        .with({ type: "removed" }, ({ id }) => removeId(current, id))
        .with({ type: "updated" }, ({ count, completed }) =>
          applyUpdated(current, count, completed),
        )
        .with({ type: "conflict" }, ({ missingIds }) => applyConflict(current, missingIds))
        .exhaustive(),
    )
    .exhaustive();
}

//Readers: small pure helpers used by the labels, the flow and the views. They never change the state.
export function selectedCount(state: SelectionState): number {
  return state.mode === "on" ? state.selected.length : 0;
}

export function isSelected(state: SelectionState, id: string): boolean {
  return state.mode === "on" && state.selected.includes(id);
}

export function isAtLimit(state: SelectionState): boolean {
  return selectedCount(state) >= SELECTION_LIMIT;
}

//True only when there is at least one id and every one of them is selected.
export function allSelected(ids: readonly string[], state: SelectionState): boolean {
  return state.mode === "on" && ids.length > 0 && ids.every((id) => state.selected.includes(id));
}
