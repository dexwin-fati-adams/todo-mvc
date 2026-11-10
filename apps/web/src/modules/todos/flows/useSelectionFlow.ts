import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import { match } from "ts-pattern";
import type { SelectionUpdateControls } from "@/modules/todos/components/SelectionControls";
import {
  allSelected,
  initialSelection,
  isAtLimit,
  selectedCount,
  selectionReducer,
  type SelectionAction,
} from "@/modules/todos/flows/selectionReducer";
import {
  UPDATE_FAILURE_TEXT,
  UPDATE_HELP_TEXT,
  markActiveLabel,
  markCompleteLabel,
  selectionCountText,
  selectVisibleLabel as buildSelectVisibleLabel,
  updatingText,
} from "@/modules/todos/flows/selectionLabels";
import { focusIsLost } from "@/modules/todos/flows/focusIsLost";
import { useUpdateSelected } from "@/modules/todos/hooks/useUpdateSelected";

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
  //True while a batch request runs: the selection is locked and every selection control is inert.
  locked: boolean;
  //The two update buttons, the pending state and the failure alert. Present only while selection mode is on.
  update?: SelectionUpdateControls;
};

//After a press, focus goes to the count line (a plain element with tabIndex -1), to the Select todos button,
//or back to the update button that was pressed.
type FocusPlan = "count" | "entry" | "complete" | "active";

//useSelectionFlow owns the reducer, the scope tracking, the focus rule, the batch update and the numbers the view needs.
export function useSelectionFlow({
  scopeKey,
  visibleIds,
  loading,
  focusFallbackRef,
}: UseSelectionFlowParams): SelectionFlow {
  const [state, dispatch] = useReducer(selectionReducer, initialSelection);
  const entryRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const completeRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const focusPlan = useRef<FocusPlan | null>(null);
  const { update: sendUpdate } = useUpdateSelected();

  //The ref is the guard (it changes at once, even before React renders). The state only draws the pending look.
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

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
    const target = match(plan)
      .with("count", () => countRef.current)
      .with("entry", () => entryRef.current ?? focusFallbackRef?.current ?? null)
      .with("complete", () => completeRef.current)
      .with("active", () => activeRef.current)
      .exhaustive();
    target?.focus();
  });

  //A Set makes each "is this row selected?" check instant, instead of a scan of the whole list for every row.
  const selectedIds = useMemo(() => new Set(state.mode === "on" ? state.selected : []), [state]);

  //Runs an action and asks for a focus move afterwards.
  //If the action changes nothing, React skips the render and the effect above never runs.
  //Then the stored plan would fire later, on an unrelated render. So in that case we store nothing.
  //While a batch request runs the selection is locked, so every press does nothing.
  function press(action: SelectionAction, plan: FocusPlan) {
    if (pendingRef.current) {
      return;
    }
    if (selectionReducer(state, action) === state) {
      return;
    }
    focusPlan.current = plan;
    dispatch(action);
  }

  //Sends the selected ids once. Success clears the selection, a conflict removes the missing ids,
  //any other failure keeps the selection and shows the safe message. Nothing here throws.
  async function runUpdate(ids: readonly string[], completed: boolean) {
    const button: FocusPlan = completed ? "complete" : "active";
    try {
      const outcome = await sendUpdate([...ids], completed);
      outcome.match(
        ({ updatedCount }) => {
          focusPlan.current = "count";
          dispatch({ type: "updated", count: updatedCount, completed });
        },
        (error) =>
          match(error)
            .with({ type: "BATCH_CONFLICT" }, ({ missingIds }) => {
              const left = ids.filter((id) => !missingIds.includes(id)).length;
              focusPlan.current = left === 0 ? "count" : button;
              dispatch({ type: "conflict", missingIds });
            })
            .with({ type: "API_ERROR" }, { type: "NETWORK_ERROR" }, { type: "PARSE_ERROR" }, () => {
              focusPlan.current = button;
              setFailed(true);
            })
            .exhaustive(),
      );
    } catch {
      focusPlan.current = button;
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function onUpdate(completed: boolean) {
    if (pendingRef.current || state.mode !== "on" || state.selected.length === 0) {
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    void runUpdate(state.selected, completed);
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
    countText: active ? (pending ? updatingText(count) : selectionCountText(count, notice)) : "",
    selectVisibleLabel: buildSelectVisibleLabel(visibleIds.length),
    selectVisibleDisabled:
      pending || visibleIds.length === 0 || allSelected(visibleIds, state) || atLimit,
    clearDisabled: pending || count === 0,
    isSelected: (id) => selectedIds.has(id),
    //At the limit, unselected rows are disabled. A selected row stays enabled so it can be unselected.
    //While a batch request runs every row is disabled, so nothing can change what the success will clear.
    isDisabled: (id) => pending || (atLimit && !selectedIds.has(id)),
    entryRef,
    countRef,
    onEnter: () => press({ type: "enter", scopeKey }, "count"),
    onExit: () => press({ type: "exit" }, "entry"),
    onToggle: (id) => {
      if (!pendingRef.current) dispatch({ type: "toggle", id });
    },
    onSelectVisible: () => press({ type: "selectVisible", ids: visibleIds }, "count"),
    onClear: () => press({ type: "clear" }, "count"),
    onRowDeleted: (id) => dispatch({ type: "removed", id }),
    locked: pending,
    update: active
      ? {
          completeLabel: markCompleteLabel(count),
          activeLabel: markActiveLabel(count),
          disabled: pending || count === 0,
          pending,
          failureText: failed ? UPDATE_FAILURE_TEXT : null,
          helpText: UPDATE_HELP_TEXT,
          completeRef,
          activeRef,
          onComplete: () => onUpdate(true),
          onActive: () => onUpdate(false),
        }
      : undefined,
  };
}
