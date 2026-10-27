import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { SetAllCompletedResponse } from "contracts";
import { todoApi, type ClientError } from "@/api/todos/todo.api";
import { useSetAllCompleted } from "@/modules/todos/hooks/useSetAllCompleted";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setAllCompleted: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const updated: SetAllCompletedResponse = { updatedCount: 45 };

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
  api.setAllCompleted.mockReturnValue(okAsync(updated));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSetAllCompleted", () => {
  // 17
  it("calls todoApi.setAllCompleted once with the chosen boolean and resolves with updatedCount", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    let outcome!: Result<SetAllCompletedResponse, ClientError>;
    await act(async () => {
      outcome = await result.current.setAll(true);
    });

    expect(api.setAllCompleted).toHaveBeenCalledTimes(1);
    expect(api.setAllCompleted).toHaveBeenCalledWith(true);
    expect(outcome._unsafeUnwrap()).toEqual(updated);
  });

  it("passes false through as false", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    await act(async () => {
      await result.current.setAll(false);
    });

    expect(api.setAllCompleted).toHaveBeenCalledWith(false);
  });

  // 18
  it("invalidates every todos query after a successful update", async () => {
    const { queryClient, wrapper } = createWrapper();
    // Three different keys: a page, a status and a search. All of them start with "todos".
    queryClient.setQueryData(["todos", "all", null, 1, 20], { rows: 1 });
    queryClient.setQueryData(["todos", "active", null, 2, 20], { rows: 2 });
    queryClient.setQueryData(["todos", "all", "milk", 1, 20], { rows: 3 });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    await act(async () => {
      await result.current.setAll(true);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expect(queryClient.getQueryState(["todos", "all", null, 1, 20])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["todos", "active", null, 2, 20])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["todos", "all", "milk", 1, 20])?.isInvalidated).toBe(true);
  });

  // 19
  it("does not invalidate on a 503, and resolves with the typed error", async () => {
    api.setAllCompleted.mockReturnValue(errAsync(unavailable));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    let outcome!: Result<SetAllCompletedResponse, ClientError>;
    await act(async () => {
      outcome = await result.current.setAll(true);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate on a network error, and resolves with the typed error", async () => {
    api.setAllCompleted.mockReturnValue(errAsync(offline));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    let outcome!: Result<SetAllCompletedResponse, ClientError>;
    await act(async () => {
      outcome = await result.current.setAll(true);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(offline);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never throws, so a failed update does not reject the returned promise", async () => {
    api.setAllCompleted.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    await act(async () => {
      await expect(result.current.setAll(true)).resolves.toBeDefined();
    });
  });

  // 20
  it("refresh invalidates the todos queries and does not call the adapter", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetAllCompleted(), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expect(api.setAllCompleted).not.toHaveBeenCalled();
  });
});
