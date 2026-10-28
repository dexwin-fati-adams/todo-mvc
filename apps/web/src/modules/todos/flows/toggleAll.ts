import { match } from "ts-pattern";

export type ToggleAllCounts = {
  activeCount: number;
  completedCount: number;
};

export type ToggleAllChoice = { kind: "none" } | { kind: "set"; completed: boolean };

// Which boolean should "toggle all" send? Only the two counts decide, never the rows, page, status or search.
export function chooseToggleAll({ activeCount, completedCount }: ToggleAllCounts): ToggleAllChoice {
  if (activeCount + completedCount === 0) return { kind: "none" };
  // If even one todo is still active, the user wants everything complete. Otherwise everything goes back to active.
  return { kind: "set", completed: activeCount > 0 };
}

// The checkbox is ticked only when every todo is complete.
export function isAllCompleted({ activeCount, completedCount }: ToggleAllCounts): boolean {
  return activeCount === 0 && completedCount > 0;
}

// The label always says "all" and the real total, so nobody thinks it only changes the visible page.
export function toggleAllLabel(choice: ToggleAllChoice, total: number): string {
  return match(choice)
    .with({ kind: "none" }, () => "")
    .with({ kind: "set" }, ({ completed }) => {
      const state = completed ? "complete" : "active";
      return total === 1 ? `Mark the 1 todo as ${state}` : `Mark all ${total} todos as ${state}`;
    })
    .exhaustive();
}
