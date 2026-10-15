import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { TodoQueryError } from "@/modules/todos/hooks/useTodos";

//TanStack Query needs a rejected promise, so this turns a failed Result into a thrown TodoQueryError that still
// carries the original ClientError inside it.
const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

//useDeleteTodo wraps todoApi.remove in a mutation. After a successful delete it refreshes every todos list query, and it
// waits for that refetch, so the row stays pending until the list no longer has the todo.
//A 404 means the todo was already deleted somewhere else, so the list is refreshed then too and the stale row disappears.
//Any other failure leaves the list alone, because the todo still exists.
//remove never throws. It resolves with ok, or with the typed ClientError when the delete fails.
export function useDeleteTodo() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<undefined, TodoQueryError, string>({
    mutationFn: (id) => unwrap(todoApi.remove(id)),
    onSuccess: refreshTodos,
    onError: (error) =>
      match(error.clientError)
        .with({ type: "API_ERROR", status: 404 }, refreshTodos)
        .otherwise(() => undefined),
  });

  return {
    remove: (id: string): Promise<Result<undefined, ClientError>> =>
      mutation.mutateAsync(id).then(
        () => ok<undefined, ClientError>(undefined),
        (error: TodoQueryError) => err<undefined, ClientError>(error.clientError),
      ),
  };
}
