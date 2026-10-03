import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import type { CreateTodoRequest, Todo } from "contracts";
import { todoApi, type ClientError } from "@/api/todo.api";
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

//useCreateTodo wraps todoApi.create in a mutation. After a successful create it refreshes every todos list query,
// and it waits for that refresh, so the list is up to date by the time submit resolves.
//submit never throws. It resolves with the new todo, or with the typed ClientError when the create fails.
export function useCreateTodo() {
  const queryClient = useQueryClient();

  const mutation = useMutation<Todo, TodoQueryError, CreateTodoRequest>({
    mutationFn: (body) => unwrap(todoApi.create(body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  return {
    submit: (body: CreateTodoRequest): Promise<Result<Todo, ClientError>> =>
      mutation.mutateAsync(body).then(
        (todo) => ok<Todo, ClientError>(todo),
        (error: TodoQueryError) => err<Todo, ClientError>(error.clientError),
      ),
    isPending: mutation.isPending,
    error: mutation.error?.clientError ?? null,
    reset: mutation.reset,
  };
}
