import { useQuery } from "@tanstack/react-query";
import type { ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import type { Status, TodoListResponse } from "contracts";
import { formatError, todoApi, type ClientError } from "@/api/todos/todo.api";
import { DEFAULT_PAGE_SIZE, type PageSize } from "@/modules/todos/flows/pageSize";

///This code defines all the possible todo loading states and creates a special error type
// that keeps the original API error while giving it a readable message.
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

//The counts of the response that is on screen. They are null while there is no response for the selected status,
// so the controls never show a number that belongs to another status.
export type TodoCounts = {
  active: number;
  completed: number;
};

export type TodoListQuery = {
  status?: Status;
  search?: string | null;
  page?: number;
  pageSize?: PageSize;
};

export type TodoPagination = {
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
};

type ListRequest = NonNullable<Parameters<typeof todoApi.list>[0]>;

//This function takes the API result, returns the data if the request succeeds,
//  and throws a TodoQueryError if the request fails
const unwrap = <T>(result: ResultAsync<T, ClientError>): Promise<T> =>
  result.match(
    (data) => data,
    (error) => {
      throw new TodoQueryError(error);
    },
  );

//The request leaves out search, page, and pageSize when they have their default values.
function toListRequest(
  status: Status,
  search: string | null,
  page: number,
  pageSize: PageSize,
): ListRequest {
  return {
    status,
    ...(search === null ? {} : { search }),
    ...(page > 1 ? { page } : {}),
    ...(pageSize !== DEFAULT_PAGE_SIZE ? { pageSize } : {}),
  };
}

//This function looks at whether the todos are loading, failed, empty, refreshing, or successfully loaded,
// and then returns the correct TodoServerState for the UI.
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

//useTodos is a custom React hook that fetches todos from the backend, tracks whether the request is loading/failed/empty/ready,
//  and gives the UI the todos, the counts, the pagination, the error, and a way to refresh them.
//The query key contains the status, the search, the page, and the page size,
//so each combination has its own result and a new one starts with no rows.
export function useTodos({
  status = "all",
  search = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: TodoListQuery = {}) {
  const query = useQuery<TodoListResponse, TodoQueryError>({
    queryKey: ["todos", status, search, page, pageSize],
    queryFn: () => unwrap(todoApi.list(toListRequest(status, search, page, pageSize))),
  });

  const data = query.data;

  const pagination: TodoPagination | null =
    data === undefined
      ? null
      : {
          page,
          pageSize,
          totalItems: data.totalItems,
          totalPages: data.totalPages,
        };

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
    counts:
      data === undefined ? null : { active: data.activeCount, completed: data.completedCount },
    pagination,
  };
}
