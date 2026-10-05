import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { Todo } from "contracts";
import { todoApi, type ClientError } from "@/api/todos-api/todo.api";
import { useCreateTodo } from "@/modules/todos/hooks/useCreateTodo";

vi.mock("@/api/todos-api/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos-api/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const body = { title: "Buy milk" };

const apiError = { type: "API_ERROR" as const, status: 503, message: "Down" };

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
  api.create.mockReturnValue(okAsync(todo));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCreateTodo", () => {
  it("calls todoApi.create with the body", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    await act(async () => {
      await result.current.submit(body);
    });

    expect(api.create).toHaveBeenCalledWith(body);
  });

  it("resolves with the created todo", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.submit(body);
    });

    expect(outcome._unsafeUnwrap()).toEqual(todo);
  });

  it("is pending while the request is in flight", async () => {
    let release!: (value: Result<Todo, ClientError>) => void;
    const pending = new Promise<Result<Todo, ClientError>>((resolve) => {
      release = resolve;
    });
    api.create.mockReturnValue(new ResultAsync(pending));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateTodo(), { wrapper });
    expect(result.current.isPending).toBe(false);

    let submitted!: Promise<unknown>;
    act(() => {
      submitted = result.current.submit(body);
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));

    release(ok(todo));
    await act(async () => {
      await submitted;
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("invalidates the todos list query after a successful create", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    await act(async () => {
      await result.current.submit(body);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("resolves with the typed error and exposes it when the create fails", async () => {
    api.create.mockReturnValue(errAsync(apiError));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    let outcome!: Result<Todo, ClientError>;
    await act(async () => {
      outcome = await result.current.submit(body);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(apiError);
    await waitFor(() => expect(result.current.error).toEqual(apiError));
  });

  it("does not invalidate the list when the create fails", async () => {
    api.create.mockReturnValue(errAsync(apiError));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateTodo(), { wrapper });

    await act(async () => {
      await result.current.submit(body);
    });

    await waitFor(() => expect(result.current.error).toEqual(apiError));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("clears the error when reset is called", async () => {
    api.create.mockReturnValue(errAsync(apiError));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateTodo(), { wrapper });
    await act(async () => {
      await result.current.submit(body);
    });
    await waitFor(() => expect(result.current.error).toEqual(apiError));

    act(() => {
      result.current.reset();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
