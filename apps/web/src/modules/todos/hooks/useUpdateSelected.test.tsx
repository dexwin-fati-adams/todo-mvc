import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { UpdateBatchResponse } from "contracts";
import { todoApi, type UpdateBatchError } from "@/api/todos/todo.api";
import { useUpdateSelected } from "@/modules/todos/hooks/useUpdateSelected";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setAllCompleted: vi.fn(),
    updateBatch: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const updated: UpdateBatchResponse = { updatedCount: 2 };
const conflict = { type: "BATCH_CONFLICT" as const, missingIds: [ids[1]!] };
const unavailable = { type: "API_ERROR" as const, status: 503, message: "Down" };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function seedKeys(queryClient: QueryClient) {
  queryClient.setQueryData(["todos", "all", null, 1, 20], { rows: 1 });
  queryClient.setQueryData(["todos", "active", null, 2, 20], { rows: 2 });
  queryClient.setQueryData(["todos", "all", "milk", 1, 20], { rows: 3 });
}

function expectAllStale(queryClient: QueryClient) {
  expect(queryClient.getQueryState(["todos", "all", null, 1, 20])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["todos", "active", null, 2, 20])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["todos", "all", "milk", 1, 20])?.isInvalidated).toBe(true);
}

beforeEach(() => {
  api.updateBatch.mockReturnValue(okAsync(updated));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useUpdateSelected", () => {
  // 44
  it("calls todoApi.updateBatch once with the ids and the boolean, and returns its result", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    let outcome!: Result<UpdateBatchResponse, UpdateBatchError>;
    await act(async () => {
      outcome = await result.current.update(ids, true);
    });

    expect(api.updateBatch).toHaveBeenCalledTimes(1);
    expect(api.updateBatch).toHaveBeenCalledWith({ ids, completed: true });
    expect(outcome._unsafeUnwrap()).toEqual(updated);
  });

  it("passes false through as false", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    await act(async () => {
      await result.current.update(ids, false);
    });

    expect(api.updateBatch).toHaveBeenCalledWith({ ids, completed: false });
  });

  // 45
  it("invalidates every todos query after a successful update", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    await act(async () => {
      await result.current.update(ids, true);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expectAllStale(queryClient);
  });

  // 46
  it("also invalidates on a conflict, and returns the conflict", async () => {
    api.updateBatch.mockReturnValue(errAsync(conflict));
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    let outcome!: Result<UpdateBatchResponse, UpdateBatchError>;
    await act(async () => {
      outcome = await result.current.update(ids, true);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(conflict);
    expectAllStale(queryClient);
  });

  // 47
  it("does not invalidate on any other failure, and returns the error", async () => {
    api.updateBatch.mockReturnValue(errAsync(unavailable));
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    let outcome!: Result<UpdateBatchResponse, UpdateBatchError>;
    await act(async () => {
      outcome = await result.current.update(ids, true);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
    expect(invalidate).not.toHaveBeenCalled();
  });

  // 48
  it("never throws, so a failed update does not reject the returned promise", async () => {
    api.updateBatch.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    await act(async () => {
      await expect(result.current.update(ids, true)).resolves.toBeDefined();
    });
  });

  // 49
  it("refresh invalidates the todos queries and does not call the adapter", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateSelected(), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expectAllStale(queryClient);
    expect(api.updateBatch).not.toHaveBeenCalled();
  });
});
