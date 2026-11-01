import { match } from "ts-pattern";
import type { ToggleAllCounts } from "@/modules/todos/flows/toggleAll";

export type ClearCompletedChoice = { kind: "none" } | { kind: "clear"; count: number };

//This function checks if there are completed tasks and returns their number if there are, otherwise it returns none
export function chooseClearCompleted({ completedCount }: ToggleAllCounts): ClearCompletedChoice {
  return completedCount > 0 ? { kind: "clear", count: completedCount } : { kind: "none" };
}

//This function displays the correct message for clearing completed todos, depending on whether there are none, one, or many.

export function clearCompletedLabel(choice: ClearCompletedChoice): string {
  return match(choice)
    .with({ kind: "none" }, () => "")
    .with({ kind: "clear" }, ({ count }) =>
      count === 1 ? "Clear the 1 completed todo" : `Clear all ${count} completed todos`,
    )
    .exhaustive();
}
