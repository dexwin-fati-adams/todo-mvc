import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import {
  allSelected,
  initialSelection,
  isAtLimit,
  isSelected,
  selectedCount,
  selectionReducer,
} from "@/modules/todos/flows/selectionReducer";
import {
  selectionCountText,
  selectVisibleLabel as buildSelectVisibleLabel,
} from "@/modules/todos/flows/selectionLabels";

export type UseSelectionFlowParams = {
  //The scope is the status and the committed search together. The page and the page size are not part of it.
  scopeKey: string;
  //The ids of the todos on screen, in order.
  visibleIds: readonly string[];
  //True while the first response for the current list is still loading. The entry button is then shown but disabled.
  loading: boolean;
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

//Focus is "lost" when it is on the page body, or on a button that has just become disabled.
//If the user has moved focus to something else, it is not lost and we leave it alone.
function focusIsLost(): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    (active instanceof HTMLButtonElement && active.disabled)
  );
}

//useSelectionFlow owns the reducer, the scope tracking, the focus rule and the numbers the view needs.
//It uses no network and no QueryClient, so no other test file needs a new mock for it.
export function useSelectionFlow({
  scopeKey,
  visibleIds,
  loading,
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
    const target = plan === "count" ? countRef.current : entryRef.current;
    target?.focus();
  });

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
    isSelected: (id) => isSelected(state, id),
    //At the limit, unselected rows are disabled. A selected row stays enabled so it can be unselected.
    isDisabled: (id) => atLimit && !isSelected(state, id),
    entryRef,
    countRef,
    onEnter: () => {
      focusPlan.current = "count";
      dispatch({ type: "enter", scopeKey });
    },
    onExit: () => {
      focusPlan.current = "entry";
      dispatch({ type: "exit" });
    },
    onToggle: (id) => dispatch({ type: "toggle", id }),
    onSelectVisible: () => {
      focusPlan.current = "count";
      dispatch({ type: "selectVisible", ids: visibleIds });
    },
    onClear: () => {
      focusPlan.current = "count";
      dispatch({ type: "clear" });
    },
    onRowDeleted: (id) => dispatch({ type: "removed", id }),
  };
}
