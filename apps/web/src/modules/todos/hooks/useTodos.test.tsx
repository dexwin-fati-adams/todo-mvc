import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { ReactNode } from "react";
import type { Status } from "contracts";
import { todoApi } from "@/api/todos/todo.api";
import { useTodos } from "@/modules/todos/hooks/useTodos";

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

function listOf(todos: (typeof todo)[]) {
  return {
    todos,
    activeCount: todos.filter((t) => !t.completed).length,
    completedCount: todos.filter((t) => t.completed).length,
    page: 1,
    pageSize: 20,
    totalItems: todos.length,
    totalPages: 1,
  };
}

//The rows the server would return for each status.
function todosFor(status: Status | undefined) {
  if (status === "active") {
    return [todo];
  }
  if (status === "completed") {
    return [doneTodo];
  }
  return [todo, doneTodo];
}

function givenListByStatus() {
  api.list.mockImplementation((query) => okAsync(listOf(todosFor(query?.status))));
}

const apiError = { type: "API_ERROR" as const, status: 503, message: "Down" };

function neverResolves<T>(): ResultAsync<T, never> {
  return ResultAsync.fromSafePromise(new Promise<T>(() => {}));
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

beforeEach(() => {
  api.list.mockReturnValue(okAsync(listOf([todo, doneTodo])));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useTodos query", () => {
  it("starts as initial-loading with empty defaults", () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    expect(result.current.serverState).toBe("initial-loading");
    expect(result.current.todos).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("returns todos and becomes ready once the list loads", async () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(result.current.todos).toEqual([todo, doneTodo]);
    expect(result.current.error).toBeNull();
  });

  it("passes the status to todoApi.list as a query object", async () => {
    const { result } = renderHook(() => useTodos("active"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(api.list).toHaveBeenCalledWith({ status: "active" });
  });

  it("defaults the status to all", async () => {
    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(api.list).toHaveBeenCalledWith({ status: "all" });
  });

  it("refetches when the status changes", async () => {
    const { result, rerender } = renderHook(({ status }) => useTodos(status), {
      wrapper: createWrapper(),
      initialProps: { status: "all" as Status },
    });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    rerender({ status: "completed" });

    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ status: "completed" }));
    await waitFor(() => expect(result.current.serverState).toBe("ready"));
  });
});

describe("useTodos query identity", () => {
  it.each<Status>(["all", "active", "completed"])(
    "requests the %s status from the server",
    async (status) => {
      const { result } = renderHook(() => useTodos(status), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.serverState).toBe("ready"));

      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenCalledWith({ status });
    },
  );

  it("gives each status its own query key, and every key starts with todos", async () => {
    givenListByStatus();
    const queryClient = createClient();
    const { result, rerender } = renderHook(({ status }) => useTodos(status), {
      wrapper: createWrapper(queryClient),
      initialProps: { status: "all" as Status },
    });
    await waitFor(() => expect(result.current.todos).toEqual([todo, doneTodo]));

    rerender({ status: "active" });
    await waitFor(() => expect(result.current.todos).toEqual([todo]));

    rerender({ status: "completed" });
    await waitFor(() => expect(result.current.todos).toEqual([doneTodo]));

    const keys = queryClient
      .getQueryCache()
      .findAll({ queryKey: ["todos"] })
      .map((query) => query.queryKey);
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["todos", "all"],
        ["todos", "active"],
        ["todos", "completed"],
      ]),
    );
  });

  it("shows loading and no rows when the status changes and the new request is pending", async () => {
    givenListByStatus();
    const { result, rerender } = renderHook(({ status }) => useTodos(status), {
      wrapper: createWrapper(),
      initialProps: { status: "active" as Status },
    });
    await waitFor(() => expect(result.current.todos).toEqual([todo]));

    api.list.mockReturnValue(neverResolves());
    rerender({ status: "completed" });

    await waitFor(() => expect(result.current.serverState).toBe("initial-loading"));
    expect(result.current.todos).toEqual([]);
  });

  it("shows a status's own earlier rows as refreshing when the user comes back to it, never another status's rows", async () => {
    givenListByStatus();
    const { result, rerender } = renderHook(({ status }) => useTodos(status), {
      wrapper: createWrapper(),
      initialProps: { status: "all" as Status },
    });
    await waitFor(() => expect(result.current.todos).toEqual([todo, doneTodo]));
    rerender({ status: "active" });
    await waitFor(() => expect(result.current.todos).toEqual([todo]));

    api.list.mockReturnValue(neverResolves());
    rerender({ status: "all" });

    await waitFor(() => expect(result.current.serverState).toBe("refreshing"));
    expect(result.current.todos).toEqual([todo, doneTodo]);
  });
});

describe("useTodos counts", () => {
  it("has no counts before the first response", () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    expect(result.current.counts).toBeNull();
  });

  it("returns the counts of the response once the list loads", async () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(result.current.counts).toEqual({ active: 1, completed: 1 });
  });

  it("has no counts when the first load fails", async () => {
    api.list.mockReturnValue(errAsync(apiError));

    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("initial-failure"));

    expect(result.current.counts).toBeNull();
  });

  it("has no counts while a new status loads for the first time", async () => {
    givenListByStatus();
    const { result, rerender } = renderHook(({ status }) => useTodos(status), {
      wrapper: createWrapper(),
      initialProps: { status: "all" as Status },
    });
    await waitFor(() => expect(result.current.counts).toEqual({ active: 1, completed: 1 }));

    api.list.mockReturnValue(neverResolves());
    rerender({ status: "completed" });

    await waitFor(() => expect(result.current.serverState).toBe("initial-loading"));
    expect(result.current.counts).toBeNull();
  });

  it("keeps the counts of the response on screen when a refetch fails", async () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    api.list.mockReturnValue(errAsync(apiError));
    result.current.refetch();

    await waitFor(() => expect(result.current.serverState).toBe("refresh-failure"));

    expect(result.current.counts).toEqual({ active: 1, completed: 1 });
  });
});

describe("useTodos serverState", () => {
  it("is initial-failure when the first load fails", async () => {
    api.list.mockReturnValue(errAsync(apiError));

    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("initial-failure"));

    expect(result.current.todos).toEqual([]);
  });

  it("is empty when the list loads with no todos", async () => {
    api.list.mockReturnValue(okAsync(listOf([])));

    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("empty"));

    expect(result.current.todos).toEqual([]);
  });

  it("is refreshing while a refetch is in flight and keeps the existing todos", async () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    api.list.mockReturnValue(neverResolves());
    result.current.refetch();

    await waitFor(() => expect(result.current.serverState).toBe("refreshing"));

    expect(result.current.todos).toEqual([todo, doneTodo]);
  });

  it("is refresh-failure when a refetch fails after data was loaded", async () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    api.list.mockReturnValue(errAsync(apiError));
    result.current.refetch();

    await waitFor(() => expect(result.current.serverState).toBe("refresh-failure"));

    expect(result.current.todos).toEqual([todo, doneTodo]);
  });
});

describe("useTodos error", () => {
  it("exposes the underlying ClientError for an API failure", async () => {
    api.list.mockReturnValue(errAsync(apiError));

    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toEqual(apiError);
  });

  it("exposes the underlying ClientError for a network failure", async () => {
    const networkError = { type: "NETWORK_ERROR" as const, message: "Offline" };
    api.list.mockReturnValue(errAsync(networkError));

    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toEqual(networkError));
  });

  it("clears the error after a successful refetch", async () => {
    api.list.mockReturnValue(errAsync(apiError));
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("initial-failure"));

    api.list.mockReturnValue(okAsync(listOf([todo])));
    result.current.refetch();

    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(result.current.error).toBeNull();
    expect(result.current.todos).toEqual([todo]);
  });
});

describe("useTodos refetch", () => {
  it("calls todoApi.list again with the current status", async () => {
    const { result } = renderHook(() => useTodos("active"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));
    api.list.mockClear();

    result.current.refetch();

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    expect(api.list).toHaveBeenCalledWith({ status: "active" });
  });

  it("returns undefined instead of a promise", async () => {
    const { result } = renderHook(() => useTodos("all"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    expect(result.current.refetch()).toBeUndefined();
  });
});
