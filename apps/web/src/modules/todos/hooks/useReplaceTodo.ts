import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import type { ReplaceTodoRequest, Todo } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { TodoQueryError } from "@/modules/todos/hooks/useTodos";

type ReplaceVariables = { id: string; body: ReplaceTodoRequest };

//unwrap takes a ResultAsync, returns the data if successful, and throws an error if it fails.
const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

//useReplaceTodo updates a Todo through the API, refreshes the Todo list when successful, 
// and returns either the updated Todo or an error.
export function useReplaceTodo() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<Todo, TodoQueryError, ReplaceVariables>({
    mutationFn: ({ id, body }) => unwrap(todoApi.replace(id, body)),
    onSuccess: refreshTodos,
  });

  return {
    replace: (id: string, body: ReplaceTodoRequest): Promise<Result<Todo, ClientError>> =>
      mutation.mutateAsync({ id, body }).then(
        (todo) => ok<Todo, ClientError>(todo),
        (error: TodoQueryError) => err<Todo, ClientError>(error.clientError),
      ),
    refresh: (): Promise<void> => refreshTodos(),
  };
}