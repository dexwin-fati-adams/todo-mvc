import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { SetAllCompletedResponse } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import { ToggleAll } from "@/modules/todos/components/ToggleAll";
import { useSetAllCompleted } from "@/modules/todos/hooks/useSetAllCompleted";
import {
  useToggleAllFlow,
  type UseToggleAllFlowInput,
} from "@/modules/todos/flows/useToggleAllFlow";

vi.mock("@/modules/todos/hooks/useSetAllCompleted");

type Outcome = Result<SetAllCompletedResponse, ClientError>;
const setAll = vi.fn<(completed: boolean) => Promise<Outcome>>();

const defaults: UseToggleAllFlowInput = {
  counts: { active: 3, completed: 2 },
  listIsSettled: true,
  viewKey: "view-a",
};

function Harness(props: UseToggleAllFlowInput) {
  const flow = useToggleAllFlow(props);
  return (
    <>
      <ToggleAll {...flow} />
      <button type="button">Elsewhere</button>
    </>
  );
}

function setup(overrides: Partial<UseToggleAllFlowInput> = {}) {
  const utils = render(<Harness {...defaults} {...overrides} />);
  return {
    ...utils,
    rerenderWith: (next: Partial<UseToggleAllFlowInput>) =>
      utils.rerender(<Harness {...defaults} {...next} />),
  };
}

function holdNext() {
  let release!: (outcome: Outcome) => void;
  setAll.mockReturnValueOnce(
    new Promise<Outcome>((resolve) => {
      release = resolve;
    }),
  );
  return async (outcome: Outcome) => {
    await act(async () => {
      release(outcome);
    });
  };
}

const checkbox = () => screen.getByRole("checkbox");

beforeEach(() => {
  setAll.mockReset();
  setAll.mockResolvedValue(ok({ updatedCount: 5 }));
  vi.mocked(useSetAllCompleted).mockReturnValue({
    setAll,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
});

describe("useToggleAllFlow", () => {
  // 32
  it("is visible, unchecked and labelled for a mixed list", () => {
    setup();
    expect(checkbox()).not.toBeChecked();
    expect(checkbox()).toHaveAccessibleName("Mark all 5 todos as complete");
  });

  // 33
  it("is checked and offers to mark all active when every todo is complete", () => {
    setup({ counts: { active: 0, completed: 5 } });
    expect(checkbox()).toBeChecked();
    expect(checkbox()).toHaveAccessibleName("Mark all 5 todos as active");
  });

  // 34
  it.each([
    { name: "no todos", counts: { active: 0, completed: 0 }, listIsSettled: true },
    { name: "no counts on first load", counts: null, listIsSettled: false },
    { name: "a failed list with no counts", counts: null, listIsSettled: true },
  ])("is not shown for $name", ({ counts, listIsSettled }) => {
    setup({ counts, listIsSettled });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  // 35
  it("sends true for a mixed list", async () => {
    setup();
    await userEvent.click(checkbox());
    expect(setAll).toHaveBeenCalledTimes(1);
    expect(setAll).toHaveBeenCalledWith(true);
  });

  it("sends false when every todo is complete", async () => {
    setup({ counts: { active: 0, completed: 5 } });
    await userEvent.click(checkbox());
    expect(setAll).toHaveBeenCalledTimes(1);
    expect(setAll).toHaveBeenCalledWith(false);
  });

  // 36
  it("calls the hook with only the boolean, so the page, status and search cannot leak in", async () => {
    setup();
    await userEvent.click(checkbox());
    expect(setAll.mock.calls[0]).toEqual([true]);
  });

  // 37
  it("is disabled, busy and says Updating all todos… while pending", async () => {
    const release = holdNext();
    const { container } = setup();

    await userEvent.click(checkbox());

    expect(checkbox()).toBeDisabled();
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Updating all todos…");
    await release(ok({ updatedCount: 5 }));
  });

  // 38
  it("sends no second request when onToggle is called twice before React re-renders", async () => {
    const release = holdNext();
    const { result } = renderHook(() => useToggleAllFlow(defaults));

    act(() => {
      result.current.onToggle();
      result.current.onToggle();
    });

    expect(setAll).toHaveBeenCalledTimes(1);
    await release(ok({ updatedCount: 5 }));
  });

  // 39
  it("shows the success message and enables the checkbox again", async () => {
    setup();
    await userEvent.click(checkbox());

    expect(await screen.findByText("Marked 5 todos as complete.")).toBeInTheDocument();
    expect(checkbox()).toBeEnabled();
  });

  // 40
  it("says there is nothing to update when the server changed zero todos", async () => {
    setAll.mockResolvedValue(ok({ updatedCount: 0 }));
    setup();
    await userEvent.click(checkbox());

    expect(await screen.findByText("There are no todos to update.")).toBeInTheDocument();
  });

  // 41
  it("shows the safe failure message, enables the checkbox, and sends a new request on retry", async () => {
    setAll.mockResolvedValueOnce(err({ type: "API_ERROR", status: 503, message: "Down" }));
    setup();

    await userEvent.click(checkbox());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update all todos. Please try again.",
    );
    expect(checkbox()).toBeEnabled();

    await userEvent.click(checkbox());
    expect(setAll).toHaveBeenCalledTimes(2);
  });

  // 42
  it("never shows the status code or the server text", async () => {
    setAll.mockResolvedValue(
      err({ type: "API_ERROR", status: 503, message: "secret-internal-detail" }),
    );
    setup();

    await userEvent.click(checkbox());

    await screen.findByRole("alert");
    expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
  });

  // 43
  it("is not stuck disabled when setAll throws", async () => {
    setAll.mockRejectedValue(new Error("boom"));
    setup();

    await userEvent.click(checkbox());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update all todos. Please try again.",
    );
    expect(checkbox()).toBeEnabled();
  });

  // 44
  it("puts focus back on the checkbox after success", async () => {
    const release = holdNext();
    setup();
    await userEvent.click(checkbox());
    expect(checkbox()).toBeDisabled();

    await release(ok({ updatedCount: 5 }));

    await waitFor(() => expect(checkbox()).toHaveFocus());
  });

  it("puts focus back on the checkbox after a failure", async () => {
    const release = holdNext();
    setup();
    await userEvent.click(checkbox());

    await release(err({ type: "NETWORK_ERROR", message: "Offline" }));

    await waitFor(() => expect(checkbox()).toHaveFocus());
  });

  it("does not steal focus when the user moved elsewhere", async () => {
    const release = holdNext();
    setup();
    await userEvent.click(checkbox());
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();

    await release(ok({ updatedCount: 5 }));

    expect(elsewhere).toHaveFocus();
  });

  // 45
  it("keeps the last known counts and is disabled while a new page loads", () => {
    const { rerenderWith } = setup();

    rerenderWith({ counts: null, listIsSettled: false });

    expect(checkbox()).toBeDisabled();
    expect(checkbox()).toHaveAccessibleName("Mark all 5 todos as complete");
  });

  it("sends no request from unknown counts", async () => {
    const { rerenderWith } = setup();
    rerenderWith({ counts: null, listIsSettled: false });

    const { result } = renderHook(() =>
      useToggleAllFlow({ counts: null, listIsSettled: false, viewKey: "x" }),
    );
    act(() => result.current.onToggle());

    expect(setAll).not.toHaveBeenCalled();
  });

  // 46
  it("removes the success message when the view changes", async () => {
    const { rerenderWith } = setup();
    await userEvent.click(checkbox());
    await screen.findByText("Marked 5 todos as complete.");

    rerenderWith({ viewKey: "view-b" });

    expect(screen.queryByText("Marked 5 todos as complete.")).not.toBeInTheDocument();
  });

  it("removes the failure message when the next click starts", async () => {
    setAll.mockResolvedValueOnce(err({ type: "NETWORK_ERROR", message: "Offline" }));
    setup();
    await userEvent.click(checkbox());
    await screen.findByRole("alert");
    holdNext();

    await userEvent.click(checkbox());

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveTextContent("Updating all todos…");
  });
});
