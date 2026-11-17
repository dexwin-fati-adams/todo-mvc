import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SelectionControls,
  type SelectionControlsProps,
  type SelectionDeleteControls,
} from "@/modules/todos/components/SelectionControls";
import { focusRing } from "@/modules/todos/components/focusRing";

const DELETE = "Delete 3 selected todos";
const QUESTION = "Delete 3 selected todos? This cannot be undone.";
const CONFIRM = "Yes, delete 3 todos";
const FAILURE = "Could not delete the selected todos. Please try again.";

function removeProps(overrides: Partial<SelectionDeleteControls> = {}): SelectionDeleteControls {
  return {
    label: DELETE,
    disabled: false,
    pending: false,
    confirming: false,
    questionText: QUESTION,
    confirmLabel: CONFIRM,
    cancelLabel: "Cancel",
    helpText: "Deleting cannot be undone.",
    failureText: null,
    onDelete: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

function setup(
  remove: SelectionDeleteControls | undefined,
  overrides: Partial<SelectionControlsProps> = {},
) {
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
    remove,
    ...overrides,
  };
  render(<SelectionControls {...props} />);
}

describe("SelectionControls: delete", () => {
  // 31
  it("shows the delete button with its label and help text, enabled", () => {
    setup(removeProps());

    expect(screen.getByRole("button", { name: DELETE })).toBeEnabled();
    expect(screen.getByText("Deleting cannot be undone.")).toBeInTheDocument();
  });

  it("gives the delete button the real disabled attribute, and a click calls nothing", async () => {
    const remove = removeProps({ disabled: true });
    setup(remove);
    const button = screen.getByRole("button", { name: DELETE });

    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(remove.onDelete).not.toHaveBeenCalled();
  });

  // 32
  it("calls onDelete once and renders no confirmation until confirming is true", async () => {
    const remove = removeProps();
    setup(remove);

    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: CONFIRM })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: DELETE }));
    expect(remove.onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders the question, the confirm button and Cancel when confirming", () => {
    setup(removeProps({ confirming: true }));

    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  // 33
  it("calls the confirm and cancel handlers once each, and no other handler", async () => {
    const remove = removeProps({ confirming: true });
    setup(remove);

    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(remove.onConfirm).toHaveBeenCalledTimes(1);
    expect(remove.onCancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove.onCancel).toHaveBeenCalledTimes(1);
    expect(remove.onConfirm).toHaveBeenCalledTimes(1);
    expect(remove.onDelete).not.toHaveBeenCalled();
  });

  // 34
  it("while pending, the group is aria-busy and every delete button is really disabled", async () => {
    const remove = removeProps({ pending: true, disabled: true, confirming: true });
    setup(remove);

    expect(screen.getByRole("group", { name: "Selection mode" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    for (const name of [DELETE, CONFIRM, "Cancel"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    expect(remove.onDelete).not.toHaveBeenCalled();
    expect(remove.onConfirm).not.toHaveBeenCalled();
    expect(remove.onCancel).not.toHaveBeenCalled();
  });

  // 35
  it("renders the failure alert only when there is failure text", () => {
    const { unmount } = render(<div />);
    unmount();
    setup(removeProps({ failureText: FAILURE }));

    expect(screen.getByRole("alert")).toHaveTextContent(FAILURE);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("renders no alert and exactly one status when there is no failure", () => {
    setup(removeProps());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  // 36
  it("gives the new buttons the focus ring", () => {
    setup(removeProps({ confirming: true }));

    for (const name of [DELETE, CONFIRM, "Cancel"]) {
      expect(screen.getByRole("button", { name }).className).toContain(focusRing);
    }
  });

  // 37
  it("renders no delete button with the mode off, or without the remove prop", () => {
    const { unmount } = render(<div />);
    unmount();
    setup(removeProps(), { active: false });
    expect(screen.queryByRole("button", { name: DELETE })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders no delete button when the remove prop is absent", () => {
    setup(undefined);

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
