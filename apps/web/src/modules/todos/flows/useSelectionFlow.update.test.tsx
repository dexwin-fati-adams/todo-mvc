import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { UpdateBatchResponse } from "contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateBatchError } from "@/api/todos/todo.api";
import { SelectionControls } from "@/modules/todos/components/SelectionControls";
import {
  useSelectionFlow,
  type SelectionFlow,
  type UseSelectionFlowParams,
} from "@/modules/todos/flows/useSelectionFlow";

const { updateSelected } = vi.hoisted(() => ({ updateSelected: vi.fn() }));
vi.mock("@/modules/todos/hooks/useUpdateSelected", () => ({
  useUpdateSelected: () => ({ update: updateSelected, refresh: vi.fn() }),
}));

type Outcome = Result<UpdateBatchResponse, UpdateBatchError>;

const ALL = JSON.stringify(["all", null]);
const ACTIVE = JSON.stringify(["active", null]);
const FAILURE = "Could not update the selected todos. Please try again.";
const unavailable: UpdateBatchError = { type: "API_ERROR", status: 503, message: "Down" };

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
  const initialProps = { ...baseParams, ...overrides };
  const hook = renderHook((props: UseSelectionFlowParams) => useSelectionFlow(props), {
    initialProps,
  });
  act(() => hook.result.current.onEnter());
  act(() => hook.result.current.onToggle("a"));
  act(() => hook.result.current.onToggle("b"));
  return hook;
}

function renderHarness() {
  const latest: { current: SelectionFlow | null } = { current: null };
  function Harness(props: UseSelectionFlowParams) {
    const flow = useSelectionFlow(props);
    latest.current = flow;
    return (
      <>
        <SelectionControls
          visible={flow.visible}
          active={flow.active}
          entryDisabled={flow.entryDisabled}
          countText={flow.countText}
          selectVisibleLabel={flow.selectVisibleLabel}
          selectVisibleDisabled={flow.selectVisibleDisabled}
          clearDisabled={flow.clearDisabled}
          entryRef={flow.entryRef}
          countRef={flow.countRef}
          onEnter={flow.onEnter}
          onExit={flow.onExit}
          onSelectVisible={flow.onSelectVisible}
          onClear={flow.onClear}
          update={flow.update}
        />
        <button type="button">Somewhere else</button>
      </>
    );
  }
  render(<Harness {...baseParams} />);
  return latest;
}

async function enterAndSelect(latest: ReturnType<typeof renderHarness>) {
  await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
  act(() => latest.current?.onToggle("a"));
  act(() => latest.current?.onToggle("b"));
}

const COMPLETE_BUTTON = "Mark 2 selected todos as complete";

beforeEach(() => {
  updateSelected.mockReset();
  updateSelected.mockResolvedValue(ok({ updatedCount: 2 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSelectionFlow: update selected", () => {
  // 68
  it("sends the selected ids in selection order and true, once", async () => {
    const { result } = renderHook((p: UseSelectionFlowParams) => useSelectionFlow(p), {
      initialProps: baseParams,
    });
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("b"));
    act(() => result.current.onToggle("a"));

    await act(async () => result.current.update?.onComplete());

    expect(updateSelected).toHaveBeenCalledTimes(1);
    expect(updateSelected).toHaveBeenCalledWith(["b", "a"], true);
  });

  // 69
  it("sends false for the active button", async () => {
    const { result } = setup();

    await act(async () => result.current.update?.onActive());

    expect(updateSelected).toHaveBeenCalledWith(["a", "b"], false);
  });

  // 70
  it("takes the ids only from the selection, including ids that are not on screen", async () => {
    const { result, rerender } = setup();
    rerender({ scopeKey: ALL, visibleIds: ["x", "y"], loading: false });

    await act(async () => result.current.update?.onComplete());

    expect(updateSelected).toHaveBeenCalledWith(["a", "b"], true);
  });

  // 71
  it("locks the selection and disables the buttons while the request runs", async () => {
    const pending = deferred();
    updateSelected.mockReturnValue(pending.promise);
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(result.current.locked).toBe(true);
    expect(result.current.update?.pending).toBe(true);
    expect(result.current.update?.disabled).toBe(true);
    expect(result.current.isDisabled("c")).toBe(true);
    expect(result.current.isDisabled("a")).toBe(true);
    expect(result.current.countText).toBe("Updating 2 selected todos…");

    await act(async () => pending.resolve(ok({ updatedCount: 2 })));
  });

  // 72
  it("sends one request when the button is pressed twice in a row", async () => {
    const pending = deferred();
    updateSelected.mockReturnValue(pending.promise);
    const { result } = setup();

    await act(async () => {
      result.current.update?.onComplete();
      result.current.update?.onComplete();
    });
    await act(async () => result.current.update?.onActive());

    expect(updateSelected).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(ok({ updatedCount: 2 })));
  });

  // 73
  it("after success the selection is empty, the mode stays on, and the message uses the server count", async () => {
    updateSelected.mockResolvedValue(ok({ updatedCount: 7 }));
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(0);
    expect(result.current.countText).toBe(
      "0 of 100 selected. Marked 7 selected todos as complete.",
    );
    expect(result.current.update?.pending).toBe(false);
    expect(result.current.update?.disabled).toBe(true);
    expect(result.current.update?.failureText).toBeNull();
  });

  // 74
  it("after a conflict removes the missing ids, keeps the rest, and a retry sends only the rest", async () => {
    updateSelected.mockResolvedValueOnce(err({ type: "BATCH_CONFLICT", missingIds: ["b"] }));
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(updateSelected).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.update?.disabled).toBe(false);
    expect(result.current.countText).toBe(
      "1 of 100 selected. Nothing was changed. 1 selected todo no longer exists and was removed from the selection.",
    );

    await act(async () => result.current.update?.onComplete());

    expect(updateSelected).toHaveBeenCalledTimes(2);
    expect(updateSelected).toHaveBeenLastCalledWith(["a"], true);
  });

  // 75
  it("after a conflict that removed every id the selection is empty and the buttons are disabled", async () => {
    updateSelected.mockResolvedValue(err({ type: "BATCH_CONFLICT", missingIds: ["a", "b"] }));
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(result.current.count).toBe(0);
    expect(result.current.update?.disabled).toBe(true);
  });

  // 76
  it("after a failure keeps the selection, shows the safe message, and a retry sends a new request", async () => {
    updateSelected.mockResolvedValueOnce(err(unavailable));
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(result.current.count).toBe(2);
    expect(result.current.update?.failureText).toBe(FAILURE);
    expect(result.current.update?.disabled).toBe(false);

    await act(async () => result.current.update?.onComplete());

    expect(updateSelected).toHaveBeenCalledTimes(2);
    expect(result.current.update?.failureText).toBeNull();
  });

  it("clears the failure message as soon as a retry starts", async () => {
    updateSelected.mockResolvedValueOnce(err(unavailable));
    const { result } = setup();
    await act(async () => result.current.update?.onComplete());
    expect(result.current.update?.failureText).toBe(FAILURE);

    const pending = deferred();
    updateSelected.mockReturnValue(pending.promise);
    await act(async () => result.current.update?.onComplete());

    expect(result.current.update?.failureText).toBeNull();

    await act(async () => pending.resolve(ok({ updatedCount: 2 })));
  });

  // 77
  it("never shows a status code or server text in the failure message", async () => {
    updateSelected.mockResolvedValue(err(unavailable));
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(result.current.update?.failureText).toBe(FAILURE);
    expect(result.current.update?.failureText).not.toMatch(/503|Down/);
  });

  // 78
  it("is not stuck pending when the hook rejects, and shows the failure", async () => {
    updateSelected.mockRejectedValue(new Error("boom"));
    const { result } = setup();

    await act(async () => result.current.update?.onComplete());

    expect(result.current.locked).toBe(false);
    expect(result.current.update?.pending).toBe(false);
    expect(result.current.update?.failureText).toBe(FAILURE);
    expect(result.current.count).toBe(2);
  });

  // 79
  it("does not bring the selection back when the scope changes while the request runs", async () => {
    const pending = deferred();
    updateSelected.mockReturnValue(pending.promise);
    const { result, rerender } = setup();

    await act(async () => result.current.update?.onComplete());
    rerender({ scopeKey: ACTIVE, visibleIds: ["a", "b"], loading: false });
    await act(async () => pending.resolve(err(unavailable)));

    expect(result.current.count).toBe(0);
    expect(result.current.isSelected("a")).toBe(false);
  });

  // 80
  it("moves focus to the count line after success", async () => {
    const latest = renderHarness();
    await enterAndSelect(latest);

    await userEvent.click(screen.getByRole("button", { name: COMPLETE_BUTTON }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
  });

  it("returns focus to the pressed button after a failure", async () => {
    updateSelected.mockResolvedValue(err(unavailable));
    const latest = renderHarness();
    await enterAndSelect(latest);

    await userEvent.click(screen.getByRole("button", { name: COMPLETE_BUTTON }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: COMPLETE_BUTTON })).toHaveFocus();
  });

  it("returns focus to the pressed button after a conflict with ids left", async () => {
    updateSelected.mockResolvedValue(err({ type: "BATCH_CONFLICT", missingIds: ["b"] }));
    const latest = renderHarness();
    await enterAndSelect(latest);

    await userEvent.click(screen.getByRole("button", { name: COMPLETE_BUTTON }));

    const retry = await screen.findByRole("button", { name: "Mark 1 selected todo as complete" });
    expect(retry).toHaveFocus();
  });

  it("moves focus to the count line after a conflict that removed every id", async () => {
    updateSelected.mockResolvedValue(err({ type: "BATCH_CONFLICT", missingIds: ["a", "b"] }));
    const latest = renderHarness();
    await enterAndSelect(latest);

    await userEvent.click(screen.getByRole("button", { name: COMPLETE_BUTTON }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
  });

  it("does not steal focus when the user moved it elsewhere while the request ran", async () => {
    const pending = deferred();
    updateSelected.mockReturnValue(pending.promise);
    const latest = renderHarness();
    await enterAndSelect(latest);
    await userEvent.click(screen.getByRole("button", { name: COMPLETE_BUTTON }));
    const elsewhere = screen.getByRole("button", { name: "Somewhere else" });
    elsewhere.focus();

    await act(async () => pending.resolve(ok({ updatedCount: 2 })));

    expect(elsewhere).toHaveFocus();
  });

  // 81
  it("replaces the message when the next action starts", async () => {
    const { result } = setup();
    await act(async () => result.current.update?.onComplete());
    expect(result.current.countText).toContain("Marked 2 selected todos as complete.");

    act(() => result.current.onToggle("a"));

    expect(result.current.countText).toBe("1 of 100 selected");
  });

  // 82
  it("does nothing for toggle, select visible, clear and exit while a request runs", async () => {
    const pending = deferred();
    updateSelected.mockReturnValue(pending.promise);
    const { result } = setup();
    await act(async () => result.current.update?.onComplete());

    act(() => result.current.onToggle("c"));
    act(() => result.current.onSelectVisible());
    act(() => result.current.onClear());
    act(() => result.current.onExit());

    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected("c")).toBe(false);

    await act(async () => pending.resolve(ok({ updatedCount: 2 })));
  });
});

describe("useSelectionFlow: stale failure alert", () => {
  it("clears the failure alert when the user leaves selection mode and comes back", async () => {
    updateSelected.mockResolvedValueOnce(err(unavailable));
    const { result } = setup();
    await act(async () => result.current.update?.onComplete());
    expect(result.current.update?.failureText).toBe(FAILURE);

    act(() => result.current.onExit());
    act(() => result.current.onEnter());

    expect(result.current.update?.failureText).toBeNull();
  });

  it("clears the failure alert when the scope changes", async () => {
    updateSelected.mockResolvedValueOnce(err(unavailable));
    const { result, rerender } = setup();
    await act(async () => result.current.update?.onComplete());
    expect(result.current.update?.failureText).toBe(FAILURE);

    rerender({ scopeKey: ACTIVE, visibleIds: ["a", "b"], loading: false });

    expect(result.current.update?.failureText).toBeNull();
  });

  it("clears the failure alert when the selection is cleared", async () => {
    updateSelected.mockResolvedValueOnce(err(unavailable));
    const { result } = setup();
    await act(async () => result.current.update?.onComplete());

    act(() => result.current.onClear());

    expect(result.current.update?.failureText).toBeNull();
  });
});
