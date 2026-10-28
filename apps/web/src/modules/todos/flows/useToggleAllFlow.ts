import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import type { ToggleAllMessageKind } from "@/modules/todos/components/ToggleAll";
import {
  chooseToggleAll,
  isAllCompleted,
  toggleAllLabel,
  type ToggleAllCounts,
} from "@/modules/todos/flows/toggleAll";
import { useSetAllCompleted } from "@/modules/todos/hooks/useSetAllCompleted";

export const TOGGLE_ALL_HELP = "This changes every todo, including other pages and filters.";
export const TOGGLE_ALL_PENDING = "Updating all todos…";
export const TOGGLE_ALL_FAILED = "Could not update all todos. Please try again.";
export const TOGGLE_ALL_NOTHING = "There are no todos to update.";

//The shape useTodos returns for counts.
export type FlowCounts = { active: number; completed: number };

export type UseToggleAllFlowInput = {
  counts: FlowCounts | null;

  listIsSettled: boolean;

  viewKey: string;
};

type FlowState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "succeeded"; message: string; forView: string }
  | { status: "failed"; forView: string };

const IDLE: FlowState = { status: "idle" };

function toCounts({ active, completed }: FlowCounts): ToggleAllCounts {
  return { activeCount: active, completedCount: completed };
}

function successMessage(updatedCount: number, completed: boolean): string {
  if (updatedCount === 0) return TOGGLE_ALL_NOTHING;
  const state = completed ? "complete" : "active";
  return updatedCount === 1
    ? `Marked 1 todo as ${state}.`
    : `Marked ${updatedCount} todos as ${state}.`;
}

export function useToggleAllFlow({ counts, listIsSettled, viewKey }: UseToggleAllFlowInput) {
  const { setAll } = useSetAllCompleted();
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const restoreFocus = useRef(false);
  const [state, setState] = useState<FlowState>(IDLE);

  const [lastKnown, setLastKnown] = useState<FlowCounts | null>(counts);
  if (
    counts !== null &&
    (lastKnown === null ||
      lastKnown.active !== counts.active ||
      lastKnown.completed !== counts.completed)
  ) {
    setLastKnown(counts);
  }

  const countsUnknown = counts === null;

  const effective = counts ?? (listIsSettled ? null : lastKnown);
  const choice =
    effective === null ? ({ kind: "none" } as const) : chooseToggleAll(toCounts(effective));
  const total = effective === null ? 0 : effective.active + effective.completed;

  const run = async (completed: boolean) => {
    try {
      const result = await setAll(completed);
      result.match(
        ({ updatedCount }) =>
          setState({
            status: "succeeded",
            message: successMessage(updatedCount, completed),
            forView: viewKey,
          }),
        () => setState({ status: "failed", forView: viewKey }),
      );
    } catch {
      //The hook should never throw, but if something does, the control must not stay stuck.
      setState({ status: "failed", forView: viewKey });
    } finally {
      inFlight.current = false;
    }
  };

  const onToggle = () => {
    //inFlight.current checks whether an operation is alreadyrunning.
    if (inFlight.current) return;
    if (countsUnknown) return;
    if (choice.kind === "none") return;

    inFlight.current = true;
    restoreFocus.current = document.activeElement === inputRef.current;
    setState({ status: "pending" });
    void run(choice.completed);
  };

  useEffect(() => {
    if (state.status === "pending" || !restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body || active === inputRef.current) {
      inputRef.current?.focus();
    }
  }, [state.status]);

  //A finished message belongs to the view it was made in.
  const shown: FlowState =
    (state.status === "succeeded" || state.status === "failed") && state.forView !== viewKey
      ? IDLE
      : state;

  const { message, messageKind } = match(shown)
    .with({ status: "idle" }, () => ({
      message: "",
      messageKind: null as ToggleAllMessageKind | null,
    }))
    .with({ status: "pending" }, () => ({
      message: TOGGLE_ALL_PENDING,
      messageKind: "pending" as ToggleAllMessageKind | null,
    }))
    .with({ status: "succeeded" }, (value) => ({
      message: value.message,
      messageKind: "success" as ToggleAllMessageKind | null,
    }))
    .with({ status: "failed" }, () => ({
      message: TOGGLE_ALL_FAILED,
      messageKind: "failure" as ToggleAllMessageKind | null,
    }))
    .exhaustive();

  return {
    visible: choice.kind !== "none",
    checked: effective !== null && isAllCompleted(toCounts(effective)),
    disabled: shown.status === "pending" || countsUnknown,
    label: toggleAllLabel(choice, total),
    helpText: TOGGLE_ALL_HELP,
    message,
    messageKind,
    inputRef,
    onToggle,
  };
}
