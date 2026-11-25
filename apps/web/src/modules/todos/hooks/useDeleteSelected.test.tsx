import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { errAsync, okAsync, type Result } from "neverthrow";
import type { ReactNode } from "react";
import type { DeleteBatchResponse } from "contracts";
import { todoApi, type DeleteBatchError } from "@/api/todos/todo.api";
import { useDeleteSelected } from "@/modules/todos/hooks/useDeleteSelected";

vi.mock("@/api/todos/todo.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/todos/todo.api")>()),
  todoApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setAllCompleted: vi.fn(),
    updateBatch: vi.fn(),
    deleteBatch: vi.fn(),
  },
}));

const api = vi.mocked(todoApi);

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const deleted: DeleteBatchResponse = { deletedCount: 2 };
const conflict = { type: "BATCH_CONFLICT" as const, missingIds: [ids[1]!] };
const unavailable = { type: "API_ERROR" as const, status: 503, message: "Down" };
const offline = { type: "NETWORK_ERROR" as const, message: "offline" };
const unreadable = { type: "PARSE_ERROR" as const, message: "bad" };

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

function expectNoneStale(queryClient: QueryClient) {
  expect(queryClient.getQueryState(["todos", "all", null, 1, 20])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(["todos", "active", null, 2, 20])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(["todos", "all", "milk", 1, 20])?.isInvalidated).toBe(false);
}

beforeEach(() => {
  api.deleteBatch.mockReturnValue(okAsync(deleted));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDeleteSelected", () => {
  it("calls todoApi.deleteBatch once with the ids and returns its result (21)", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteSelected(), { wrapper });

    let outcome!: Result<DeleteBatchResponse, DeleteBatchError>;
    await act(async () => {
      outcome = await result.current.remove(ids);
    });

    expect(api.deleteBatch).toHaveBeenCalledTimes(1);
    expect(api.deleteBatch).toHaveBeenCalledWith({ ids });
    expect(outcome._unsafeUnwrap()).toEqual(deleted);
  });

  it("marks every todos query stale after a success (22)", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const { result } = renderHook(() => useDeleteSelected(), { wrapper });

    await act(async () => {
      await result.current.remove(ids);
    });

    expectAllStale(queryClient);
  });

  it("also marks every todos query stale after a conflict (23)", async () => {
    api.deleteBatch.mockReturnValue(errAsync(conflict));
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const { result } = renderHook(() => useDeleteSelected(), { wrapper });

    let outcome!: Result<DeleteBatchResponse, DeleteBatchError>;
    await act(async () => {
      outcome = await result.current.remove(ids);
    });

    expect(outcome._unsafeUnwrapErr()).toEqual(conflict);
    expectAllStale(queryClient);
  });

  it.each([
    ["a 503", unavailable],
    ["a network error", offline],
    ["an unreadable answer", unreadable],
  ])("leaves the list alone after %s (24)", async (_name, failure) => {
    api.deleteBatch.mockReturnValue(errAsync(failure));
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const { result } = renderHook(() => useDeleteSelected(), { wrapper });

    await act(async () => {
      await result.current.remove(ids);
    });

    expectNoneStale(queryClient);
  });

  it("resolves with the typed error and never rejects (25)", async () => {
    api.deleteBatch.mockReturnValue(errAsync(unavailable));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteSelected(), { wrapper });

    let outcome!: Result<DeleteBatchResponse, DeleteBatchError>;
    await act(async () => {
      outcome = await result.current.remove(ids);
    });

    expect(outcome.isErr()).toBe(true);
    expect(outcome._unsafeUnwrapErr()).toEqual(unavailable);
  });

  it("refresh marks every todos query stale and does not call the adapter (26)", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedKeys(queryClient);
    const { result } = renderHook(() => useDeleteSelected(), { wrapper });

    await act(async () => {
      await result.current.refresh();
    });

    expectAllStale(queryClient);
    expect(api.deleteBatch).not.toHaveBeenCalled();
  });
});
