import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import type { DeleteCompletedResponse } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { TodoQueryError } from "@/modules/todos/hooks/useTodos";

const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

export function useClearCompleted() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<DeleteCompletedResponse, TodoQueryError, void>({
    mutationFn: () => unwrap(todoApi.clearCompleted()),
    onSuccess: refreshTodos,
  });

  return {
    clear: (): Promise<Result<DeleteCompletedResponse, ClientError>> =>
      mutation.mutateAsync().then(
        (response) => ok<DeleteCompletedResponse, ClientError>(response),
        (error: TodoQueryError) => err<DeleteCompletedResponse, ClientError>(error.clientError),
      ),
    refresh: (): Promise<void> => refreshTodos(),
  };
}
