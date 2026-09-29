import { useQuery } from "@tanstack/react-query";
import type { ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import type { Status, TodoListResponse } from "contracts";
import { formatError, todoApi, type ClientError } from "../todo.api";

export type TodoServerState =
  "initial-loading" | "initial-failure" | "empty" | "ready" | "refreshing" | "refresh-failure";

export class TodoQueryError extends Error {
  readonly clientError: ClientError;

  constructor(clientError: ClientError) {
    super(formatError(clientError));
    this.name = "TodoQueryError";
    this.clientError = clientError;
  }
}

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
  const query = useQuery<TodoListResponse, TodoQueryError>({
    queryKey: ["todos", status],
    queryFn: () => unwrap(todoApi.list({ status })),
  });

  const data = query.data;

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
  };
}
