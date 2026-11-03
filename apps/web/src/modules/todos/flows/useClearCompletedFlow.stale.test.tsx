import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ok } from "neverthrow";
import { useClearCompleted } from "@/modules/todos/hooks/useClearCompleted";
import {
  useClearCompletedFlow,
  type UseClearCompletedFlowParams,
} from "@/modules/todos/flows/useClearCompletedFlow";

vi.mock("@/modules/todos/hooks/useClearCompleted");

const clear = vi.fn();

const base: UseClearCompletedFlowParams = {
  counts: { activeCount: 1, completedCount: 3 },
  listIsSettled: true,
  listKey: "a",
};

function setup() {
  return renderHook((props: UseClearCompletedFlowParams) => useClearCompletedFlow(props), {
    initialProps: base,
  });
}

beforeEach(() => {
  clear.mockReset();
  clear.mockResolvedValue(ok({ deletedCount: 3 }));
  vi.mocked(useClearCompleted).mockReturnValue({
    clear,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
});

describe("useClearCompletedFlow: stale counts", () => {
  // Bug 1
  it("hides the button when the list fails to load, instead of showing old counts", () => {
    const { result, rerender } = setup();
    expect(result.current.buttonVisible).toBe(true);

    rerender({ counts: null, listIsSettled: true, listKey: "b" });

    expect(result.current.buttonVisible).toBe(false);
  });

  it("keeps the last counts, disabled, while a new key is still loading", () => {
    const { result, rerender } = setup();

    rerender({ counts: null, listIsSettled: false, listKey: "b" });

    expect(result.current.buttonVisible).toBe(true);
    expect(result.current.disabled).toBe(true);
    expect(result.current.label).toContain("3");
  });

  // Bug 2
  it("hides the button after a successful delete when the refresh never brings new counts, and sends no second request", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.onClear();
    });
    await waitFor(() => expect(result.current.messageKind).toBe("success"));

    expect(result.current.buttonVisible).toBe(false);
    act(() => result.current.onClear());
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("shows the button again with the new number when fresh counts arrive", async () => {
    const { result, rerender } = setup();
    await act(async () => {
      result.current.onClear();
    });
    await waitFor(() => expect(result.current.messageKind).toBe("success"));
    expect(result.current.buttonVisible).toBe(false);

    rerender({ counts: { activeCount: 1, completedCount: 2 }, listIsSettled: true, listKey: "a" });

    expect(result.current.buttonVisible).toBe(true);
    expect(result.current.label).toContain("2");
  });
});
