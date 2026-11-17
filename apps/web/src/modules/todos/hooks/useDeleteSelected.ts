import { ok, type Result } from "neverthrow";
import type { DeleteBatchResponse } from "contracts";
import type { DeleteBatchError } from "@/api/todos/todo.api";

type DeleteOutcome = Result<DeleteBatchResponse, DeleteBatchError>;

// M52 PLACEHOLDER: does nothing. Replaced after the red tests are pushed.
export function useDeleteSelected() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    remove: (_ids: string[]): Promise<DeleteOutcome> => Promise.resolve(ok({ deletedCount: 0 })),
    refresh: (): Promise<void> => Promise.resolve(),
  };
}
