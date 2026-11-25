import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Result } from "neverthrow";
import type { DeleteBatchResponse } from "contracts";
import { todoApi, type DeleteBatchError } from "@/api/todos/todo.api";

type DeleteInput = { ids: string[] };
type DeleteOutcome = Result<DeleteBatchResponse, DeleteBatchError>;

// The mutation function returns the adapter's Result instead of throwing, so the
// query error channel is never used and callers always get a typed value back.
// The list is refreshed after a success and after a conflict (the server's state changed
// or the selection was stale). Any other failure leaves the list alone.
export function useDeleteSelected() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<DeleteOutcome, Error, DeleteInput>({
    mutationFn: async ({ ids }) => todoApi.deleteBatch({ ids }),
    onSuccess: (outcome) =>
      outcome.match(
        () => refreshTodos(),
        (error) => (error.type === "BATCH_CONFLICT" ? refreshTodos() : undefined),
      ),
  });

  return {
    remove: (ids: string[]): Promise<DeleteOutcome> => mutation.mutateAsync({ ids }),
    refresh: (): Promise<void> => refreshTodos(),
  };
}
