import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const id = "11111111-1111-4111-8111-111111111111";

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
  api.remove.mockReturnValue(okAsync(undefined));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDeleteTodo", () => {
  it("calls todoApi.remove with the id", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    await act(async () => {
      await result.current.remove(id);
    });

    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith(id);
  });

  it("resolves with an ok result that has no value", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    let outcome!: Result<undefined, ClientError>;
    await act(async () => {
      outcome = await result.current.remove(id);
    });

    expect(outcome.isOk()).toBe(true);
    expect(outcome._unsafeUnwrap()).toBeUndefined();
  });

  it("invalidates the todos list query after a successful delete", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    await act(async () => {
      await result.current.remove(id);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("resolves only after the list refetch has finished, so the row stays pending until it is gone", async () => {
    const { queryClient, wrapper } = createWrapper();
    let finishRefetch!: () => void;
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockReturnValue(
      new Promise<void>((resolve) => {
        finishRefetch = resolve;
      }),
    );
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    let settled = false;
    let pending!: Promise<Result<undefined, ClientError>>;
    await act(async () => {
      pending = result.current.remove(id).then((outcome) => {
        settled = true;
        return outcome;
      });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] }));
    expect(settled).toBe(false);

    await act(async () => {
      finishRefetch();
      await pending;
    });

    expect(settled).toBe(true);
  });

  it("also invalidates the todos list query when the todo is already gone (404), and resolves with the typed error", async () => {
    api.remove.mockReturnValue(errAsync(notFound));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    let outcome!: Result<undefined, ClientError>;
    await act(async () => {
      outcome = await result.current.remove(id);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(notFound);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("does not invalidate the list on a 503, and resolves with the typed error", async () => {
    api.remove.mockReturnValue(errAsync(unavailable));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    let outcome!: Result<undefined, ClientError>;
    await act(async () => {
      outcome = await result.current.remove(id);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate the list on a network error, and resolves with the typed error", async () => {
    api.remove.mockReturnValue(errAsync(offline));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    let outcome!: Result<undefined, ClientError>;
    await act(async () => {
      outcome = await result.current.remove(id);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(offline);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never throws, so a failed delete does not reject the returned promise", async () => {
    api.remove.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteTodo(), { wrapper });

    await act(async () => {
      await expect(result.current.remove(id)).resolves.toBeDefined();
    });
  });
});
