import { ok, type Result } from "neverthrow";
import type { UpdateBatchResponse } from "contracts";
import type { UpdateBatchError } from "@/api/todos/todo.api";

// PLACEHOLDER (red phase): replaced by the real mutation.
export function useUpdateSelected() {
  return {
    update: (
      ids: string[],
      completed: boolean,
    ): Promise<Result<UpdateBatchResponse, UpdateBatchError>> => {
      void ids;
      void completed;
      return Promise.resolve(ok<UpdateBatchResponse, UpdateBatchError>({ updatedCount: 0 }));
    },
    refresh: (): Promise<void> => Promise.resolve(),
  };
}
