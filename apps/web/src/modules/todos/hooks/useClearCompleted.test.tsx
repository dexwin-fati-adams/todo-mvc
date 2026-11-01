import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { DeleteCompletedResponse } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { useClearCompleted } from "@/modules/todos/hooks/useClearCompleted";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    clearCompleted: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const cleared: DeleteCompletedResponse = { deletedCount: 20 };

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
  api.clearCompleted.mockReturnValue(okAsync(cleared));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useClearCompleted", () => {
  // 17
  it("calls todoApi.clearCompleted once with no arguments and resolves with deletedCount", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    let outcome!: Result<DeleteCompletedResponse, ClientError>;
    await act(async () => {
      outcome = await result.current.clear();
    });

    expect(api.clearCompleted).toHaveBeenCalledTimes(1);
    expect(api.clearCompleted).toHaveBeenCalledWith();
    expect(outcome._unsafeUnwrap()).toEqual(cleared);
  });

  // 18
  it("invalidates every todos query after a successful delete", async () => {
    const { queryClient, wrapper } = createWrapper();
    // Three different keys: a page, a status and a search. All of them start with "todos".
    queryClient.setQueryData(["todos", "all", null, 1, 20], { rows: 1 });
    queryClient.setQueryData(["todos", "completed", null, 2, 20], { rows: 2 });
    queryClient.setQueryData(["todos", "all", "milk", 1, 20], { rows: 3 });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    await act(async () => {
      await result.current.clear();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expect(queryClient.getQueryState(["todos", "all", null, 1, 20])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["todos", "completed", null, 2, 20])?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(["todos", "all", "milk", 1, 20])?.isInvalidated).toBe(true);
  });

  it("also invalidates when the server deleted nothing, so the list shows the real state", async () => {
    api.clearCompleted.mockReturnValue(okAsync({ deletedCount: 0 }));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    await act(async () => {
      await result.current.clear();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  // 19
  it("does not invalidate on a 503, and resolves with the typed error", async () => {
    api.clearCompleted.mockReturnValue(errAsync(unavailable));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    let outcome!: Result<DeleteCompletedResponse, ClientError>;
    await act(async () => {
      outcome = await result.current.clear();
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate on a network error, and resolves with the typed error", async () => {
    api.clearCompleted.mockReturnValue(errAsync(offline));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    let outcome!: Result<DeleteCompletedResponse, ClientError>;
    await act(async () => {
      outcome = await result.current.clear();
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(offline);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never throws, so a failed delete does not reject the returned promise", async () => {
    api.clearCompleted.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    await act(async () => {
      await expect(result.current.clear()).resolves.toBeDefined();
    });
  });

  // 20
  it("refresh invalidates the todos queries and does not call the adapter", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useClearCompleted(), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expect(api.clearCompleted).not.toHaveBeenCalled();
  });
});
