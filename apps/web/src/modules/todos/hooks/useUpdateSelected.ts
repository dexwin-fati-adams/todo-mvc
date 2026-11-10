import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Result } from "neverthrow";
import type { UpdateBatchResponse } from "contracts";
import { todoApi, type UpdateBatchError } from "@/api/todos/todo.api";

type UpdateInput = { ids: string[]; completed: boolean };
type UpdateOutcome = Result<UpdateBatchResponse, UpdateBatchError>;

// The mutation function returns the adapter's Result instead of throwing, so the
// query error channel is never used and callers always get a typed value back.
// The list is refreshed after a success and after a conflict (the server's state changed
// or the selection was stale). Any other failure leaves the list alone.
export function useUpdateSelected() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<UpdateOutcome, Error, UpdateInput>({
    mutationFn: ({ ids, completed }) => todoApi.updateBatch({ ids, completed }).then((r) => r),
    onSuccess: (outcome) =>
      outcome.match(
        () => refreshTodos(),
        (error) => (error.type === "BATCH_CONFLICT" ? refreshTodos() : undefined),
      ),
  });

  return {
    update: (ids: string[], completed: boolean): Promise<UpdateOutcome> =>
      mutation.mutateAsync({ ids, completed }),
    refresh: (): Promise<void> => refreshTodos(),
  };
}
