import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import type { Todo, TodoListResponse } from "contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { todoClient, type ClientError } from "../todo.api";
import { useTodos } from "./useTodos";

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

function listWith(todos: Todo[]): TodoListResponse {
  const completedCount = todos.filter((t) => t.completed).length;
  return {
    todos,
    activeCount: todos.length - completedCount,
    completedCount,
    page: 1,
    pageSize: 20,
    totalItems: todos.length,
    totalPages: todos.length === 0 ? 0 : 1,
  };
}

const networkError: ClientError = { type: "NETWORK_ERROR", message: "Failed to fetch" };

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTodos server state", () => {
  it("is initial-loading before the first response", () => {
    vi.spyOn(todoClient, "list").mockReturnValue(
      new ResultAsync<TodoListResponse, ClientError>(new Promise(() => {})),
    );

    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });

    expect(result.current.serverState).toBe("initial-loading");
    expect(result.current.todos).toEqual([]);
  });

  it("is empty when the API returns no todos", async () => {
    vi.spyOn(todoClient, "list").mockReturnValue(okAsync(listWith([])));

    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("empty"));
  });

  it("is ready when the API returns todos", async () => {
    vi.spyOn(todoClient, "list").mockReturnValue(okAsync(listWith([todo])));

    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("ready"));
    expect(result.current.todos).toEqual([todo]);
    expect(result.current.activeCount).toBe(1);
  });

  it("is initial-failure when the first request fails", async () => {
    vi.spyOn(todoClient, "list").mockReturnValue(
      errAsync<TodoListResponse, ClientError>(networkError),
    );

    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.serverState).toBe("initial-failure"));
    expect(result.current.error).toEqual(networkError);
    expect(result.current.todos).toEqual([]);
  });

  it("is refreshing on refetch and keeps the previous todos", async () => {
    const spy = vi.spyOn(todoClient, "list").mockReturnValueOnce(okAsync(listWith([todo])));
    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    let release!: (value: Result<TodoListResponse, ClientError>) => void;
    const pending = new Promise<Result<TodoListResponse, ClientError>>((resolve) => {
      release = resolve;
    });
    spy.mockReturnValueOnce(new ResultAsync(pending));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.serverState).toBe("refreshing"));
    expect(result.current.todos).toEqual([todo]);

    release(ok(listWith([todo])));
    await waitFor(() => expect(result.current.serverState).toBe("ready"));
  });

  it("is refresh-failure when a refetch fails and keeps the previous todos", async () => {
    const spy = vi.spyOn(todoClient, "list").mockReturnValueOnce(okAsync(listWith([todo])));
    const { result } = renderHook(() => useTodos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.serverState).toBe("ready"));

    spy.mockReturnValueOnce(errAsync<TodoListResponse, ClientError>(networkError));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.serverState).toBe("refresh-failure"));
    expect(result.current.todos).toEqual([todo]);
    expect(result.current.error).toEqual(networkError);
  });

  it("asks the API for the given status", async () => {
    const spy = vi.spyOn(todoClient, "list").mockReturnValue(okAsync(listWith([])));

    renderHook(() => useTodos("active"), { wrapper: createWrapper() });

    await waitFor(() => expect(spy).toHaveBeenCalledWith({ status: "active" }));
  });
});
