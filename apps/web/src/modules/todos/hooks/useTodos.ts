import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import type { Status, TodoListResponse } from "contracts";
import { formatError, todoClient, type ClientError } from "../todo.api";

// The six server states the UI must handle. The flow reads this and nothing else.
export type TodoServerState =
  | "initial-loading"
  | "initial-failure"
  | "empty"
  | "ready"
  | "refreshing"
  | "refresh-failure";

// TanStack Query needs a rejected promise, and lint wants a real Error.
// This wraps the typed ClientError so no information is lost.
export class TodoQueryError extends Error {
  readonly clientError: ClientError;

  constructor(clientError: ClientError) {
    super(formatError(clientError));
    this.name = "TodoQueryError";
    this.clientError = clientError;
  }
}

// Converts neverthrow ResultAsync into a Promise (what TanStack Query expects).
const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

function deriveServerState(input: {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  isEmpty: boolean;
}): TodoServerState {
  return match(input)
    .with({ hasData: false, isError: true }, () => "initial-failure" as const)
    .with({ hasData: false }, () => "initial-loading" as const)
    .with({ isFetching: true }, () => "refreshing" as const)
    .with({ isError: true }, () => "refresh-failure" as const)
    .with({ isEmpty: true }, () => "empty" as const)
    .otherwise(() => "ready" as const);
}

export function useTodos(status: Status = "all") {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["todos"] });

  const query = useQuery<TodoListResponse, TodoQueryError>({
    queryKey: ["todos", status],
    queryFn: () => unwrap(todoClient.list({ status })),
  });

  const addTodo = useMutation({
    mutationFn: (title: string) => unwrap(todoClient.create({ title })),
    onSuccess: invalidate,
  });

  const toggleTodo = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      unwrap(todoClient.update(id, { completed })),
    onSuccess: invalidate,
  });

  const editTodo = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      unwrap(todoClient.update(id, { title })),
    onSuccess: invalidate,
  });

  const deleteTodo = useMutation({
    mutationFn: (id: string) => unwrap(todoClient.delete(id)),
    onSuccess: invalidate,
  });

  const toggleAll = useMutation({
    mutationFn: () => unwrap(todoClient.toggleAll()),
    onSuccess: invalidate,
  });

  const clearCompleted = useMutation({
    mutationFn: () => unwrap(todoClient.clearCompleted()),
    onSuccess: invalidate,
  });

  const data = query.data;
  const activeCount = data?.activeCount ?? 0;
  const completedCount = data?.completedCount ?? 0;

  return {
    serverState: deriveServerState({
      hasData: data !== undefined,
      isError: query.isError,
      isFetching: query.isFetching,
      isEmpty: data !== undefined && data.todos.length === 0,
    }),
    error: query.error?.clientError ?? null,
    refetch: () => {
      void query.refetch();
    },
    todos: data?.todos ?? [],
    activeCount,
    completedCount,
    allCompleted: activeCount === 0 && completedCount > 0,
    addTodo: (title: string) => addTodo.mutate(title),
    toggleTodo: (id: string, completed: boolean) => toggleTodo.mutate({ id, completed }),
    editTodo: (id: string, title: string) => editTodo.mutate({ id, title }),
    deleteTodo: (id: string) => deleteTodo.mutate(id),
    toggleAll: () => toggleAll.mutate(),
    clearCompleted: () => clearCompleted.mutate(),
  };
}
