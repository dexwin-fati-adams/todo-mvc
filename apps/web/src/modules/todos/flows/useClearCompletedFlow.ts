import { useEffect, useRef, useState, type RefObject } from "react";
import { match } from "ts-pattern";
import type { ToggleAllCounts } from "@/modules/todos/flows/toggleAll";
import { chooseClearCompleted, clearCompletedLabel } from "@/modules/todos/flows/clearCompleted";
import type { ClearCompletedMessageKind } from "@/modules/todos/components/ClearCompleted";
import { useClearCompleted } from "@/modules/todos/hooks/useClearCompleted";

export type ClearCompletedFlow = {
  visible: boolean;
  buttonVisible: boolean;
  disabled: boolean;
  label: string;
  helpText: string;
  message: string;
  messageKind: ClearCompletedMessageKind | null;
  buttonRef: RefObject<HTMLButtonElement | null>;
  messageRef: RefObject<HTMLParagraphElement | null>;
  onClear: () => void;
};

export type UseClearCompletedFlowParams = {
  //null = no counts on screen right now (the list is loading or failed).
  counts: ToggleAllCounts | null;
  //This text changes whenever the status, search, page or page size changes. It clears the old message.
  listKey: string;
};

const HELP_TEXT =
  "This deletes every completed todo, including other pages and filters. It cannot be undone.";
const PENDING_MESSAGE = "Clearing completed todos…";
const FAILED_MESSAGE = "Could not clear completed todos. Please try again.";
const NOTHING_DELETED_MESSAGE = "There were no completed todos to delete.";

type Outcome =
  | { status: "idle"; message: "" }
  | { status: "pending"; message: string }
  | { status: "succeeded"; message: string }
  | { status: "failed"; message: string };

const IDLE: Outcome = { status: "idle", message: "" };

const successMessage = (deletedCount: number): string => {
  if (deletedCount === 0) return NOTHING_DELETED_MESSAGE;
  return deletedCount === 1
    ? "Deleted 1 completed todo."
    : `Deleted ${deletedCount} completed todos.`;
};

//useClearCompletedFlow owns everything that happens around the clear-completed button:
// when it shows (from the counts only), the pending state, the messages, the guard against a second submit,
// and where focus goes when the request ends. ClearCompleted only draws what this returns.
//Focus rule: after a success the button goes away (no completed todos are left), so focus goes to the status message.
// After a failure the button is still there, so focus goes back to it.
export function useClearCompletedFlow({
  counts,
  listKey,
}: UseClearCompletedFlowParams): ClearCompletedFlow {
  const { clear } = useClearCompleted();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  //A ref changes at once, but state only changes on the next render. A fast second click could arrive in between, so the ref is the real guard.
  const savingRef = useRef(false);
  const refocusRef = useRef(false);
  const [outcome, setOutcome] = useState<Outcome>(IDLE);

  //While a new page or filter loads there are no counts on screen, so the control keeps showing the last counts it knew (disabled).
  const [lastCounts, setLastCounts] = useState<ToggleAllCounts | null>(counts);
  if (
    counts !== null &&
    (lastCounts === null ||
      lastCounts.activeCount !== counts.activeCount ||
      lastCounts.completedCount !== counts.completedCount)
  ) {
    setLastCounts(counts);
  }
  const shown = counts ?? lastCounts;

  //A new page, status, search or page size drops an old success or failure message. A request that is running keeps its message.
  const [seenKey, setSeenKey] = useState(listKey);
  if (seenKey !== listKey) {
    setSeenKey(listKey);
    if (outcome.status !== "pending") setOutcome(IDLE);
  }

  //A disabled button loses focus, so when the request ends, focus goes where the user can carry on.
  //If the user moved to something else in the meantime, focus is left alone.
  useEffect(() => {
    if (outcome.status === "pending" || outcome.status === "idle" || !refocusRef.current) return;
    refocusRef.current = false;
    const active = document.activeElement;
    const lost = active === null || active === document.body || active === buttonRef.current;
    if (!lost) return;
    match(outcome.status)
      .with("succeeded", () => messageRef.current?.focus())
      .with("failed", () => buttonRef.current?.focus())
      .exhaustive();
  }, [outcome.status]);

  const onClear = () => {
    if (savingRef.current || counts === null) return;
    if (chooseClearCompleted(counts).kind === "none") return;

    savingRef.current = true;
    refocusRef.current = buttonRef.current !== null && document.activeElement === buttonRef.current;
    setOutcome({ status: "pending", message: PENDING_MESSAGE });

    clear()
      .then((result) =>
        result.match(
          ({ deletedCount }): Outcome => ({
            status: "succeeded",
            message: successMessage(deletedCount),
          }),
          (): Outcome => ({ status: "failed", message: FAILED_MESSAGE }),
        ),
      )
      //clear should never throw. If something throws anyway, the button must not stay disabled for ever.
      .catch((): Outcome => ({ status: "failed", message: FAILED_MESSAGE }))
      .then((next) => {
        savingRef.current = false;
        setOutcome(next);
      });
  };

  const choice = shown === null ? ({ kind: "none" } as const) : chooseClearCompleted(shown);
  const buttonVisible = choice.kind === "clear";

  const messageKind = match(outcome.status)
    .with("idle", (): ClearCompletedMessageKind | null => null)
    .with("pending", (): ClearCompletedMessageKind | null => "pending")
    .with("succeeded", (): ClearCompletedMessageKind | null => "success")
    .with("failed", (): ClearCompletedMessageKind | null => "failure")
    .exhaustive();

  return {
    //After a success there is nothing left to clear, but the success message must stay on the page.
    visible: buttonVisible || outcome.status !== "idle",
    buttonVisible,
    disabled: outcome.status === "pending" || counts === null,
    label: clearCompletedLabel(choice),
    helpText: HELP_TEXT,
    message: outcome.message,
    messageKind,
    buttonRef,
    messageRef,
    onClear,
  };
}
