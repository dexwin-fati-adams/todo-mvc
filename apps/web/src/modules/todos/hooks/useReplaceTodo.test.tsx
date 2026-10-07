import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { Todo } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { useReplaceTodo } from "@/modules/todos/hooks/useReplaceTodo";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    replace: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const replacedTodo: Todo = { ...todo, title: "Buy oat milk" };

const body = { title: "Buy oat milk", completed: false };

const notFound = { type: "API_ERROR" as const, status: 404, message: "Todo not found" };
const unavailable = { type: "API_ERROR" as const, status: 503, message: "Down" };
const offline = { type: "NETWORK_ERROR" as const, message: "Offline" };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  api.replace.mockReturnValue(okAsync(replacedTodo));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useReplaceTodo", () => {
  it("calls todoApi.replace with the id and the body", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    await act(async () => {
      await result.current.replace(todo.id, body);
    });

    expect(api.replace).toHaveBeenCalledWith(todo.id, body);
  });

  it("resolves with the updated todo", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.replace(todo.id, body);
    });

    expect(outcome._unsafeUnwrap()).toEqual(replacedTodo);
  });

  it("invalidates the todos list query after a successful replace", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    await act(async () => {
      await result.current.replace(todo.id, body);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("does not invalidate the list on a 404, and resolves with the typed error", async () => {
    api.replace.mockReturnValue(errAsync(notFound));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.replace(todo.id, body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(notFound);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate the list on a 503, and resolves with the typed error", async () => {
    api.replace.mockReturnValue(errAsync(unavailable));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.replace(todo.id, body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate the list on a network error, and resolves with the typed error", async () => {
    api.replace.mockReturnValue(errAsync(offline));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.replace(todo.id, body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(offline);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never throws, so a failed replace does not reject the returned promise", async () => {
    api.replace.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    await act(async () => {
      await expect(result.current.replace(todo.id, body)).resolves.toBeDefined();
    });
  });

  it("refresh invalidates the todos list query", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useReplaceTodo(), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });
});
