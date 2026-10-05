import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { Todo } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const completedTodo: Todo = { ...todo, completed: true };

const body = { completed: true };

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
  api.update.mockReturnValue(okAsync(completedTodo));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useToggleTodo", () => {
  it("calls todoApi.update with the id and the body", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    await act(async () => {
      await result.current.toggle(todo.id, body);
    });

    expect(api.update).toHaveBeenCalledWith(todo.id, body);
  });

  it("resolves with the updated todo", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.toggle(todo.id, body);
    });

    expect(outcome._unsafeUnwrap()).toEqual(completedTodo);
  });

  it("invalidates the todos list query after a successful update", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    await act(async () => {
      await result.current.toggle(todo.id, body);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("also invalidates the todos list query when the todo no longer exists (404)", async () => {
    api.update.mockReturnValue(errAsync(notFound));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.toggle(todo.id, body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(notFound);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("does not invalidate the list on a 503, and resolves with the typed error", async () => {
    api.update.mockReturnValue(errAsync(unavailable));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.toggle(todo.id, body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate the list on a network error, and resolves with the typed error", async () => {
    api.update.mockReturnValue(errAsync(offline));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.toggle(todo.id, body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(offline);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never throws, so a failed update does not reject the returned promise", async () => {
    api.update.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useToggleTodo(), { wrapper });

    await act(async () => {
      await expect(result.current.toggle(todo.id, body)).resolves.toBeDefined();
    });
  });
});
