import { act, renderHook } from "@testing-library/react";
import { err, ok, type Result } from "neverthrow";
import type { DeleteBatchResponse } from "contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteBatchError } from "@/api/todos/todo.api";
import {
  useSelectionFlow,
  type UseSelectionFlowParams,
} from "@/modules/todos/flows/useSelectionFlow";

const { updateSelected, deleteSelected } = vi.hoisted(() => ({
  updateSelected: vi.fn(),
  deleteSelected: vi.fn(),
}));
vi.mock("@/modules/todos/hooks/useUpdateSelected", () => ({
  useUpdateSelected: () => ({ update: updateSelected, refresh: vi.fn() }),
}));
vi.mock("@/modules/todos/hooks/useDeleteSelected", () => ({
  useDeleteSelected: () => ({ remove: deleteSelected, refresh: vi.fn() }),
}));

type Outcome = Result<DeleteBatchResponse, DeleteBatchError>;

const ALL = JSON.stringify(["all", null]);
const ACTIVE = JSON.stringify(["active", null]);
const FAILURE = "Could not delete the selected todos. Please try again.";
const unavailable: DeleteBatchError = { type: "API_ERROR", status: 503, message: "Down" };
const missingB: DeleteBatchError = { type: "BATCH_CONFLICT", missingIds: ["b"] };
const missingAB: DeleteBatchError = { type: "BATCH_CONFLICT", missingIds: ["a", "b"] };

const baseParams: UseSelectionFlowParams = {
  scopeKey: ALL,
  visibleIds: ["a", "b", "c"],
  loading: false,
};

function deferred() {
  let resolve!: (outcome: Outcome) => void;
  const promise = new Promise<Outcome>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

//Enters selection mode and selects "a" then "b".
function setup(overrides: Partial<UseSelectionFlowParams> = {}) {
  const hook = renderHook((props: UseSelectionFlowParams) => useSelectionFlow(props), {
    initialProps: { ...baseParams, ...overrides },
  });
  act(() => hook.result.current.onEnter());
  act(() => hook.result.current.onToggle("a"));
  act(() => hook.result.current.onToggle("b"));
  const remove = () => hook.result.current.remove!;
  return { hook, remove };
}

beforeEach(() => {
  deleteSelected.mockResolvedValue(ok({ deletedCount: 2 }));
  updateSelected.mockResolvedValue(ok({ updatedCount: 2 }));
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("useSelectionFlow: delete", () => {
  // 38
  it("delete alone sends nothing and opens the confirmation", () => {
    const { remove } = setup();

    act(() => remove().onDelete());

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(remove().confirming).toBe(true);
  });

  it("confirm sends the selected ids in selection order, once", async () => {
    const { remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(deleteSelected).toHaveBeenCalledTimes(1);
    expect(deleteSelected).toHaveBeenCalledWith(["a", "b"]);
    expect(remove().confirming).toBe(false);
  });

  // 39
  it("cancel closes the confirmation and sends nothing", () => {
    const { remove } = setup();

    act(() => remove().onDelete());
    act(() => remove().onCancel());

    expect(remove().confirming).toBe(false);
    expect(deleteSelected).not.toHaveBeenCalled();
  });

  // 40
  it("takes the ids only from the selection, not from the rows on screen", async () => {
    const { hook, remove } = setup();

    hook.rerender({ ...baseParams, visibleIds: ["x", "y"] });
    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(deleteSelected).toHaveBeenCalledWith(["a", "b"]);
  });

  it("enables the delete button only when something is selected", () => {
    const { hook, remove } = setup();
    expect(remove().disabled).toBe(false);
    expect(remove().label).toBe("Delete 2 selected todos");

    act(() => hook.result.current.onClear());
    expect(remove().disabled).toBe(true);
  });

  // 41
  it("locks the selection while pending and sends no second request", () => {
    const pending = deferred();
    deleteSelected.mockReturnValue(pending.promise);
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    act(() => {
      remove().onConfirm();
    });

    expect(remove().pending).toBe(true);
    expect(remove().disabled).toBe(true);
    expect(hook.result.current.countText).toBe("Deleting 2 selected todos…");
    expect(hook.result.current.isDisabled("c")).toBe(true);

    act(() => hook.result.current.onToggle("c"));
    act(() => hook.result.current.onClear());
    act(() => hook.result.current.onExit());
    act(() => {
      remove().onConfirm();
    });

    expect(hook.result.current.count).toBe(2);
    expect(hook.result.current.active).toBe(true);
    expect(deleteSelected).toHaveBeenCalledTimes(1);
  });

  // 42
  it("an update cannot start while a delete is pending, and the reverse", () => {
    const pendingDelete = deferred();
    deleteSelected.mockReturnValue(pendingDelete.promise);
    const first = setup();

    act(() => first.remove().onDelete());
    act(() => {
      first.remove().onConfirm();
    });
    act(() => first.hook.result.current.update!.onComplete());
    expect(updateSelected).not.toHaveBeenCalled();
    first.hook.unmount();

    const pendingUpdate = deferred();
    updateSelected.mockReturnValue(pendingUpdate.promise);
    deleteSelected.mockClear();
    const second = setup();

    act(() => {
      second.hook.result.current.update!.onComplete();
    });
    act(() => second.remove().onDelete());
    act(() => {
      second.remove().onConfirm();
    });

    expect(second.remove().confirming).toBe(false);
    expect(deleteSelected).not.toHaveBeenCalled();
  });

  // 43
  it("success empties the selection, keeps the mode, and shows the server's count", async () => {
    deleteSelected.mockResolvedValue(ok({ deletedCount: 7 }));
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(hook.result.current.active).toBe(true);
    expect(hook.result.current.count).toBe(0);
    expect(hook.result.current.countText).toBe("0 of 100 selected. Deleted 7 selected todos.");
    expect(remove().pending).toBe(false);
    expect(remove().disabled).toBe(true);
    expect(remove().failureText).toBeNull();
  });

  // 44
  it("conflict removes the missing ids, keeps the rest, sends no retry, and a retry sends only the rest", async () => {
    deleteSelected.mockResolvedValue(err(missingB));
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(hook.result.current.count).toBe(1);
    expect(hook.result.current.countText).toBe(
      "1 of 100 selected. Nothing was deleted. 1 selected todo no longer exists and was removed from the selection.",
    );
    expect(remove().disabled).toBe(false);
    expect(remove().confirming).toBe(false);
    expect(remove().failureText).toBeNull();
    expect(deleteSelected).toHaveBeenCalledTimes(1);

    deleteSelected.mockResolvedValue(ok({ deletedCount: 1 }));
    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(deleteSelected).toHaveBeenCalledTimes(2);
    expect(deleteSelected).toHaveBeenLastCalledWith(["a"]);
  });

  // 45
  it("a conflict that removes every id leaves an empty selection and disabled buttons", async () => {
    deleteSelected.mockResolvedValue(err(missingAB));
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(hook.result.current.count).toBe(0);
    expect(remove().disabled).toBe(true);
  });

  // 46
  it("failure keeps the selection, shows the safe message only, and a retry sends a new request", async () => {
    deleteSelected.mockResolvedValue(err(unavailable));
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(remove().failureText).toBe(FAILURE);
    expect(remove().failureText).not.toMatch(/503|Down/);
    expect(hook.result.current.count).toBe(2);
    expect(remove().disabled).toBe(false);
    expect(remove().confirming).toBe(false);

    deleteSelected.mockResolvedValue(ok({ deletedCount: 2 }));
    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(deleteSelected).toHaveBeenCalledTimes(2);
    expect(remove().failureText).toBeNull();
    expect(hook.result.current.count).toBe(0);
  });

  it("a rejecting hook does not leave the flow pending, and shows the safe message", async () => {
    deleteSelected.mockRejectedValue(new Error("boom"));
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });

    expect(remove().pending).toBe(false);
    expect(remove().failureText).toBe(FAILURE);
    expect(hook.result.current.count).toBe(2);
  });

  // 47
  it("a scope change while pending does not bring the selection back", async () => {
    const pending = deferred();
    deleteSelected.mockReturnValue(pending.promise);
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    act(() => {
      remove().onConfirm();
    });
    hook.rerender({ ...baseParams, scopeKey: ACTIVE });
    expect(hook.result.current.count).toBe(0);

    await act(async () => {
      pending.resolve(ok({ deletedCount: 2 }));
    });

    expect(hook.result.current.count).toBe(0);
    expect(remove().pending).toBe(false);
  });

  it("the confirmation closes on scope change, clear, exit and any selection change", () => {
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    hook.rerender({ ...baseParams, scopeKey: ACTIVE });
    expect(remove().confirming).toBe(false);

    act(() => hook.result.current.onToggle("a"));
    act(() => remove().onDelete());
    act(() => hook.result.current.onToggle("b"));
    expect(remove().confirming).toBe(false);

    act(() => remove().onDelete());
    act(() => hook.result.current.onClear());
    expect(remove().confirming).toBe(false);

    act(() => hook.result.current.onToggle("a"));
    act(() => remove().onDelete());
    act(() => hook.result.current.onExit());
    act(() => hook.result.current.onEnter());
    expect(remove().confirming).toBe(false);
  });

  it("the failure alert clears on scope change, enter, exit and clear, and when the next request starts", async () => {
    deleteSelected.mockResolvedValue(err(unavailable));
    const { hook, remove } = setup();

    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });
    expect(remove().failureText).toBe(FAILURE);

    hook.rerender({ ...baseParams, scopeKey: ACTIVE });
    expect(remove().failureText).toBeNull();

    act(() => hook.result.current.onToggle("a"));
    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });
    expect(remove().failureText).toBe(FAILURE);

    act(() => hook.result.current.onClear());
    expect(remove().failureText).toBeNull();

    act(() => hook.result.current.onToggle("a"));
    act(() => remove().onDelete());
    await act(async () => {
      remove().onConfirm();
    });
    expect(remove().failureText).toBe(FAILURE);

    const pending = deferred();
    deleteSelected.mockReturnValue(pending.promise);
    act(() => remove().onDelete());
    act(() => {
      remove().onConfirm();
    });
    expect(remove().failureText).toBeNull();
  });
});
