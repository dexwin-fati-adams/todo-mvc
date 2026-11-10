import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SelectionControls,
  type SelectionControlsProps,
  type SelectionUpdateControls,
} from "@/modules/todos/components/SelectionControls";
import { focusRing } from "@/modules/todos/components/focusRing";

const COMPLETE = "Mark 3 selected todos as complete";
const ACTIVE = "Mark 3 selected todos as active";
const FAILURE = "Could not update the selected todos. Please try again.";
const HELP = "Changes only the selected todos, on every page.";

function setup(
  updateOverrides: Partial<SelectionUpdateControls> = {},
  overrides: Partial<SelectionControlsProps> = {},
) {
  const onComplete = vi.fn();
  const onActive = vi.fn();
  const update: SelectionUpdateControls = {
    completeLabel: COMPLETE,
    activeLabel: ACTIVE,
    disabled: false,
    pending: false,
    failureText: null,
    helpText: HELP,
    onComplete,
    onActive,
    ...updateOverrides,
  };
  const props: SelectionControlsProps = {
    visible: true,
    active: true,
    entryDisabled: false,
    countText: "3 of 100 selected",
    selectVisibleLabel: "Select all 20 todos on this page",
    selectVisibleDisabled: false,
    clearDisabled: false,
    onEnter: vi.fn(),
    onExit: vi.fn(),
    onSelectVisible: vi.fn(),
    onClear: vi.fn(),
    update,
    ...overrides,
  };
  render(<SelectionControls {...props} />);
  return { onComplete, onActive };
}

describe("SelectionControls: update buttons", () => {
  // 61
  it("shows two action buttons with the given labels, enabled when something is selected", () => {
    setup();

    expect(screen.getByRole("button", { name: COMPLETE })).toBeEnabled();
    expect(screen.getByRole("button", { name: ACTIVE })).toBeEnabled();
  });

  // 62
  it("gives both buttons the real disabled attribute when disabled, and a click calls nothing", async () => {
    const { onComplete, onActive } = setup({ disabled: true });
    const complete = screen.getByRole("button", { name: COMPLETE });
    const active = screen.getByRole("button", { name: ACTIVE });

    expect(complete).toBeDisabled();
    expect(active).toBeDisabled();
    await userEvent.click(complete);
    await userEvent.click(active);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });

  // 63
  it("calls its own handler once per click", async () => {
    const { onComplete, onActive } = setup();

    await userEvent.click(screen.getByRole("button", { name: COMPLETE }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: ACTIVE }));
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // 64
  it("marks the group aria-busy while pending, with the pending text in the one status line", () => {
    setup({ pending: true, disabled: true }, { countText: "Updating 3 selected todos…" });

    expect(screen.getByRole("group", { name: "Selection mode" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Updating 3 selected todos…");
  });

  it("is not aria-busy when nothing is pending", () => {
    setup();

    expect(screen.getByRole("group", { name: "Selection mode" })).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  // 65
  it("renders the failure alert only when there is a failure message", () => {
    setup({ failureText: FAILURE });

    expect(screen.getByRole("alert")).toHaveTextContent(FAILURE);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("renders no alert when there is no failure, and never an empty one", () => {
    setup({ failureText: null });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
  });

  // 66
  it("gives both buttons the shared focus ring", () => {
    setup();

    expect(screen.getByRole("button", { name: COMPLETE }).className).toContain(focusRing);
    expect(screen.getByRole("button", { name: ACTIVE }).className).toContain(focusRing);
  });

  it("shows the help text for the update buttons", () => {
    setup();

    expect(screen.getByText(HELP)).toBeInTheDocument();
  });

  // 67
  it("draws no action button with the mode off", () => {
    setup({}, { active: false });

    expect(screen.queryByRole("button", { name: COMPLETE })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ACTIVE })).not.toBeInTheDocument();
  });
});
