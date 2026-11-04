//The most todos that can be selected at once.
export const SELECTION_LIMIT = 100;

export type SelectionNotice =
  { kind: "limit"; skipped: number } | { kind: "scope-cleared" } | { kind: "cleared" };

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
  | { type: "removed"; id: string };

export const initialSelection: SelectionState = { mode: "off" };

//PLACEHOLDER (M48 step 2): returns the state it is given, so the tests fail on missing behaviour and not on a broken import.
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  void action;
  return state;
}
