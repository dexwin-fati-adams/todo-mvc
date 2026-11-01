import { useMutation, useQueryClient } from "@tanstack/react-query";
import { err, ok, type Result, type ResultAsync } from "neverthrow";
import type { SetAllCompletedResponse } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { TodoQueryError } from "@/modules/todos/hooks/useTodos";

const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

export function useSetAllCompleted() {
  const queryClient = useQueryClient();
  const refreshTodos = () => queryClient.invalidateQueries({ queryKey: ["todos"] });

  const mutation = useMutation<SetAllCompletedResponse, TodoQueryError, boolean>({
    mutationFn: (completed) => unwrap(todoApi.setAllCompleted(completed)),
    onSuccess: refreshTodos,
  });

  return {
    setAll: (completed: boolean): Promise<Result<SetAllCompletedResponse, ClientError>> =>
      mutation.mutateAsync(completed).then(
        (response) => ok<SetAllCompletedResponse, ClientError>(response),
        (error: TodoQueryError) => err<SetAllCompletedResponse, ClientError>(error.clientError),
      ),
    refresh: (): Promise<void> => refreshTodos(),
  };
}
