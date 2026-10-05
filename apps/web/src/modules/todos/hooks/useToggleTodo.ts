import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import type { Todo, UpdateTodoRequest } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { TodoQueryError } from "@/modules/todos/hooks/useTodos";

type ToggleVariables = { id: string; body: UpdateTodoRequest };

//TanStack Query needs a rejected promise, so this turns a failed Result into a thrown TodoQueryError that still
// carries the original ClientError inside it.
const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

//useToggleTodo wraps todoApi.update in a mutation. After a successful update it refreshes every todos list query.
//A 404 means the todo was deleted somewhere else, so the list is refreshed then too and the stale row disappears.
//Any other failure leaves the list alone, so the user keeps seeing the last state the server confirmed.
//toggle never throws. It resolves with the updated todo, or with the typed ClientError when the update fails.
export function useToggleTodo() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<Todo, TodoQueryError, ToggleVariables>({
    mutationFn: ({ id, body }) => unwrap(todoApi.update(id, body)),
    onSuccess: refreshTodos,
    onError: (error) =>
      match(error.clientError)
        .with({ type: "API_ERROR", status: 404 }, refreshTodos)
        .with({ type: "API_ERROR" }, { type: "NETWORK_ERROR" }, { type: "PARSE_ERROR" }, () =>
          Promise.resolve(),
        )
        .exhaustive(),
  });

  return {
    toggle: (id: string, body: UpdateTodoRequest): Promise<Result<Todo, ClientError>> =>
      mutation.mutateAsync({ id, body }).then(
        (todo) => ok<Todo, ClientError>(todo),
        (error: TodoQueryError) => err<Todo, ClientError>(error.clientError),
      ),
  };
}
