import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { ReactNode } from "react";
import { todoApi } from "@/api/todos/todo.api";
import { useTodos, type TodoListQuery } from "@/modules/todos/hooks/useTodos";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const doneTodo = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Walk dog",
  completed: true,
  createdAt: "2026-09-29T11:00:00.000Z",
};

//A response with the pagination numbers the test wants, so the hook cannot guess them from the rows.
function pageOf(
  todos: (typeof todo)[],
  numbers: { page?: number; pageSize?: number; totalItems: number; totalPages: number },
) {
  return {
    todos,
    activeCount: todos.filter((t) => !t.completed).length,
    completedCount: todos.filter((t) => t.completed).length,
    page: numbers.page ?? 1,
    pageSize: numbers.pageSize ?? 20,
    totalItems: numbers.totalItems,
    totalPages: numbers.totalPages,
  };
}

const apiError = { type: "API_ERROR" as const, status: 503, message: "Down" };

function neverResolves<T>(): ResultAsync<T, never> {
  return ResultAsync.fromSafePromise(new Promise<T>(() => {}));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { result: ResultAsync.fromSafePromise(promise), resolve };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient = createClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const render = (initialProps: TodoListQuery, queryClient?: QueryClient) =>
  renderHook((query: TodoListQuery) => useTodos(query), {
    wrapper: createWrapper(queryClient),
    initialProps,
  });

beforeEach(() => {
  api.list.mockReturnValue(okAsync(pageOf([todo, doneTodo], { totalItems: 2, totalPages: 1 })));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useTodos page size", () => {
  it("sends no pageSize when it is the default 20", async () => {
    const { result } = render({ pageSize: 20 });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    const sent = api.list.mock.calls[0]?.[0];
    expect(sent).toEqual({ status: "all" });
    expect(sent).not.toHaveProperty("pageSize");
  });

  it("sends no pageSize when none is given", async () => {
    const { result } = render({});
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(api.list.mock.calls[0]?.[0]).not.toHaveProperty("pageSize");
  });

  it("sends the pageSize when it is not 20", async () => {
    const { result } = render({ pageSize: 50 });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(api.list).toHaveBeenCalledWith({ status: "all", pageSize: 50 });
  });

  it("sends the status, search, page, and pageSize together", async () => {
    const { result } = render({ status: "active", search: "milk", page: 3, pageSize: 10 });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(api.list).toHaveBeenCalledWith({
      status: "active",
      search: "milk",
      page: 3,
      pageSize: 10,
    });
  });

  it("gives each page size its own query key, and every key starts with todos", async () => {
    const queryClient = createClient();
    const { result, rerender } = render({}, queryClient);
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    rerender({ pageSize: 50 });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    const keys = queryClient
      .getQueryCache()
      .findAll({ queryKey: ["todos"] })
      .map((query) => query.queryKey);
    expect(keys).toHaveLength(2);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["todos", "all", null, 1, 20],
        ["todos", "all", null, 1, 50],
      ]),
    );
  });

  it("shows loading and no rows when the page size changes and the new request is pending", async () => {
    const { result, rerender } = render({});
    await waitFor(() => expect(result.current.todos).toEqual([todo, doneTodo]));

    api.list.mockReturnValue(neverResolves());
    rerender({ pageSize: 10 });

    await waitFor(() => expect(result.current.serverState).toBe("initial-loading"));
    expect(result.current.todos).toEqual([]);
    expect(result.current.counts).toBeNull();
  });

  it("shows a page size's own cached rows as refreshing when the user comes back to it", async () => {
    const { result, rerender } = render({});
    await waitFor(() => expect(result.current.todos).toEqual([todo, doneTodo]));
    api.list.mockReturnValue(okAsync(pageOf([todo], { totalItems: 2, totalPages: 2 })));
    rerender({ pageSize: 1 });
    await waitFor(() => expect(result.current.todos).toEqual([todo]));

    api.list.mockReturnValue(neverResolves());
    rerender({});

    await waitFor(() => expect(result.current.serverState).toBe("refreshing"));
    expect(result.current.todos).toEqual([todo, doneTodo]);
  });

  it("keeps the new page size's rows when the response for the old page size arrives late", async () => {
    const queryClient = createClient();
    const late = deferred<ReturnType<typeof pageOf>>();
    api.list
      .mockReturnValueOnce(late.result)
      .mockReturnValueOnce(okAsync(pageOf([todo], { totalItems: 1, totalPages: 1 })));
    const { result, rerender } = render({}, queryClient);

    rerender({ pageSize: 10 });
    await waitFor(() => expect(result.current.todos).toEqual([todo]));

    late.resolve(pageOf([doneTodo], { totalItems: 1, totalPages: 1 }));
    await waitFor(() =>
      expect(queryClient.getQueryData(["todos", "all", null, 1, 20])).toEqual(
        pageOf([doneTodo], { totalItems: 1, totalPages: 1 }),
      ),
    );

    expect(result.current.todos).toEqual([todo]);
  });
});

describe("useTodos pagination numbers", () => {
  it("has none before the first response", () => {
    const { result } = render({});

    expect(result.current.pagination).toBeNull();
  });

  it("returns the total items and total pages of the response", async () => {
    api.list.mockReturnValue(okAsync(pageOf([todo], { totalItems: 45, totalPages: 3 })));
    const { result } = render({ page: 2 });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(result.current.pagination).toEqual({ totalItems: 45, totalPages: 3 });
  });

  it("returns zero items and zero pages for an empty list", async () => {
    api.list.mockReturnValue(okAsync(pageOf([], { totalItems: 0, totalPages: 0 })));
    const { result } = render({});

    await waitFor(() => expect(result.current.serverState).toBe("empty"));

    expect(result.current.pagination).toEqual({ totalItems: 0, totalPages: 0 });
  });

  it("returns the real total pages when the page is past the end and has no rows", async () => {
    api.list.mockReturnValue(okAsync(pageOf([], { totalItems: 3, totalPages: 2, page: 9 })));
    const { result } = render({ page: 9, pageSize: 10 });

    await waitFor(() => expect(result.current.serverState).toBe("empty"));

    expect(result.current.pagination).toEqual({ totalItems: 3, totalPages: 2 });
  });

  it("has none when the first load fails", async () => {
    api.list.mockReturnValue(errAsync(apiError));
    const { result } = render({});

    await waitFor(() => expect(result.current.serverState).toBe("initial-failure"));

    expect(result.current.pagination).toBeNull();
  });

  it("has none while another page loads for the first time", async () => {
    api.list.mockReturnValue(okAsync(pageOf([todo], { totalItems: 45, totalPages: 3 })));
    const { result, rerender } = render({});
    await waitFor(() =>
      expect(result.current.pagination).toEqual({ totalItems: 45, totalPages: 3 }),
    );

    api.list.mockReturnValue(neverResolves());
    rerender({ page: 2 });

    await waitFor(() => expect(result.current.serverState).toBe("initial-loading"));
    expect(result.current.pagination).toBeNull();
  });

  it("keeps the numbers of the response on screen when a refetch fails", async () => {
    api.list.mockReturnValue(okAsync(pageOf([todo], { totalItems: 45, totalPages: 3 })));
    const { result } = render({});
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    api.list.mockReturnValue(errAsync(apiError));
    result.current.refetch();

    await waitFor(() => expect(result.current.serverState).toBe("refresh-failure"));

    expect(result.current.pagination).toEqual({ totalItems: 45, totalPages: 3 });
  });
});
