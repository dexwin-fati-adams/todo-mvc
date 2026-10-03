import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import type { CreateTodoRequest, Todo } from "contracts";
import { todoApi, type ClientError } from "@/api/todo.api";
import { TodoQueryError } from "@/modules/todos/hooks/useTodos";

//This code takes the result from an API request, returns the data if successful, but if it fails, it throws a TodoQueryError
// so the application knows something went wrong.
const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

//This code creates a custom React hook that handles creating a new todo, sends it to the backend, updates the todo list when successful,
// and manages loading and error states.
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
