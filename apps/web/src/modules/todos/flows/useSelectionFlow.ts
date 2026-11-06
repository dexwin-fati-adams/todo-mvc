import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import {
  allSelected,
  initialSelection,
  isAtLimit,
  selectedCount,
  selectionReducer,
  type SelectionAction,
} from "@/modules/todos/flows/selectionReducer";
import {
  selectionCountText,
  selectVisibleLabel as buildSelectVisibleLabel,
} from "@/modules/todos/flows/selectionLabels";
import { focusIsLost } from "@/modules/todos/flows/focusIsLost";

export type UseSelectionFlowParams = {
  //The scope is the status and the committed search together. The page and the page size are not part of it.
  scopeKey: string;
  //The ids of the todos on screen, in order.
  visibleIds: readonly string[];
  //True while the first response for the current list is still loading. The entry button is then shown but disabled.
  loading: boolean;
  //Where focus goes after Done selecting when the Select todos button is not on screen (every row was deleted).
  //Without it, focus would fall back to the page body.
  focusFallbackRef?: RefObject<HTMLElement | null>;
};

export type SelectionFlow = {
  visible: boolean;
  active: boolean;
  entryDisabled: boolean;
  count: number;
  atLimit: boolean;
  countText: string;
  selectVisibleLabel: string;
  selectVisibleDisabled: boolean;
  clearDisabled: boolean;
  isSelected: (id: string) => boolean;
  isDisabled: (id: string) => boolean;
  entryRef: RefObject<HTMLButtonElement | null>;
  countRef: RefObject<HTMLParagraphElement | null>;
  onEnter: () => void;
  onExit: () => void;
  onToggle: (id: string) => void;
  onSelectVisible: () => void;
  onClear: () => void;
  onRowDeleted: (id: string) => void;
};

//After a press, focus goes to the count line (a plain element with tabIndex -1) or to the Select todos button.
type FocusPlan = "count" | "entry";

//useSelectionFlow owns the reducer, the scope tracking, the focus rule and the numbers the view needs.
//It uses no network and no QueryClient, so no other test file needs a new mock for it.
export function useSelectionFlow({
  scopeKey,
  visibleIds,
  loading,
  focusFallbackRef,
}: UseSelectionFlowParams): SelectionFlow {
  const [state, dispatch] = useReducer(selectionReducer, initialSelection);
  const entryRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const focusPlan = useRef<FocusPlan | null>(null);

  //Same pattern as useClearCompletedFlow: remember the last scope and, only when it changes, dispatch during render.
  //React then renders again before anything is drawn, so no frame ever shows the old selection under a new scope.
  const [seenScope, setSeenScope] = useState(scopeKey);
  if (seenScope !== scopeKey) {
    setSeenScope(scopeKey);
    dispatch({ type: "scopeChanged", scopeKey });
  }

  //Runs after every render. It acts only when a press asked for it, and only if focus was lost.
  useEffect(() => {
    const plan = focusPlan.current;
    if (plan === null) {
      return;
    }
    focusPlan.current = null;
    if (!focusIsLost()) {
      return;
    }
    const target =
      plan === "count" ? countRef.current : (entryRef.current ?? focusFallbackRef?.current ?? null);
    target?.focus();
  });

  //A Set makes each "is this row selected?" check instant, instead of a scan of the whole list for every row.
  const selectedIds = useMemo(() => new Set(state.mode === "on" ? state.selected : []), [state]);

  //Runs an action and asks for a focus move afterwards.
  //If the action changes nothing, React skips the render and the effect above never runs.
  //Then the stored plan would fire later, on an unrelated render. So in that case we store nothing.
  function press(action: SelectionAction, plan: FocusPlan) {
    if (selectionReducer(state, action) === state) {
      return;
    }
    focusPlan.current = plan;
    dispatch(action);
  }

  const active = state.mode === "on";
  const count = selectedCount(state);
  const atLimit = isAtLimit(state);
  const notice = state.mode === "on" ? state.notice : null;

  return {
    //While the mode is on the toolbar always shows. While it is off the entry button needs rows, or a loading list.
    visible: active || loading || visibleIds.length > 0,
    active,
    entryDisabled: loading,
    count,
    atLimit,
    countText: active ? selectionCountText(count, notice) : "",
    selectVisibleLabel: buildSelectVisibleLabel(visibleIds.length),
    selectVisibleDisabled: visibleIds.length === 0 || allSelected(visibleIds, state) || atLimit,
    clearDisabled: count === 0,
    isSelected: (id) => selectedIds.has(id),
    //At the limit, unselected rows are disabled. A selected row stays enabled so it can be unselected.
    isDisabled: (id) => atLimit && !selectedIds.has(id),
    entryRef,
    countRef,
    onEnter: () => press({ type: "enter", scopeKey }, "count"),
    onExit: () => press({ type: "exit" }, "entry"),
    onToggle: (id) => dispatch({ type: "toggle", id }),
    onSelectVisible: () => press({ type: "selectVisible", ids: visibleIds }, "count"),
    onClear: () => press({ type: "clear" }, "count"),
    onRowDeleted: (id) => dispatch({ type: "removed", id }),
  };
}
