import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ClearCompleted,
  type ClearCompletedProps,
} from "@/modules/todos/components/ClearCompleted";

const HELP =
  "This deletes every completed todo, including other pages and filters. It cannot be undone.";
const LABEL = "Clear all 20 completed todos";

function setup(overrides: Partial<ClearCompletedProps> = {}) {
  const onClear = vi.fn();
  const props: ClearCompletedProps = {
    visible: true,
    buttonVisible: true,
    disabled: false,
    label: LABEL,
    helpText: HELP,
    message: "",
    messageKind: null,
    onClear,
    ...overrides,
  };
  const view = render(<ClearCompleted {...props} />);
  return { onClear, container: view.container };
}

describe("ClearCompleted", () => {
  // 21
  it("renders a button whose accessible name is the label", () => {
    setup();

    expect(screen.getByRole("button", { name: LABEL })).toBeInTheDocument();
  });

  // 22
  it("shows the help text and describes the button with it", () => {
    setup();

    expect(screen.getByText(HELP)).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAccessibleDescription(HELP);
  });

  // 23
  it("calls onClear once when it is clicked", async () => {
    const { onClear } = setup();

    await userEvent.click(screen.getByRole("button"));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  // 24
  it("calls onClear once for Enter and once for Space on the focused button", async () => {
    const { onClear } = setup();

    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClear).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(" ");
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  // 25
  it("has the real disabled attribute and calls nothing when disabled", async () => {
    const { onClear } = setup({ disabled: true });

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onClear).not.toHaveBeenCalled();
  });

  // 26
  it("renders nothing when it is not visible", () => {
    const { container } = setup({ visible: false, buttonVisible: false });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 27
  it("shows only the message regions, with no button and no help text, once the button has gone away", () => {
    setup({
      buttonVisible: false,
      message: "Deleted 20 completed todos.",
      messageKind: "success",
    });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(HELP)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted 20 completed todos.");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  // 28
  it("shows a success message in the status region and nothing in the alert region", () => {
    setup({ message: "Deleted 20 completed todos.", messageKind: "success" });

    expect(screen.getByRole("status")).toHaveTextContent("Deleted 20 completed todos.");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("shows a failure message in the alert region and nothing in the status region", () => {
    setup({
      message: "Could not clear completed todos. Please try again.",
      messageKind: "failure",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not clear completed todos. Please try again.",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps both live regions on the page, empty, when there is no message", () => {
    setup();

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  // 29
  it("is marked busy and shows the clearing text while pending", () => {
    const { container } = setup({
      disabled: true,
      message: "Clearing completed todos…",
      messageKind: "pending",
    });

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Clearing completed todos…");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is not marked busy when it is disabled for another reason", () => {
    const { container } = setup({ disabled: true });

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "false");
  });

  // 30
  it("has a focus ring class on the button, and the status message can take focus", () => {
    setup();

    expect(screen.getByRole("button")).toHaveClass("focus-visible:outline-2");
    expect(screen.getByRole("button")).toHaveClass("focus-visible:outline-blue-600");
    // tabIndex -1: it can be focused by code, but it is not in the tab order.
    expect(screen.getByRole("status")).toHaveAttribute("tabindex", "-1");
  });

  // 31 Plan test 31 also mentions axe. The project has no axe library, so the accessible structure is checked by hand instead.
  it("has a correct accessible structure: one named button, one description, two live regions", () => {
    setup({ message: "Deleted 20 completed todos.", messageKind: "success" });

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button")).toHaveAccessibleName(LABEL);
    expect(screen.getByRole("button")).toHaveAccessibleDescription(HELP);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("gives the button to buttonRef and the status message to messageRef", () => {
    const buttonRef = { current: null as HTMLButtonElement | null };
    const messageRef = { current: null as HTMLParagraphElement | null };
    setup({ buttonRef, messageRef });

    expect(buttonRef.current).toBe(screen.getByRole("button"));
    expect(messageRef.current).toBe(screen.getByRole("status"));
  });

  it("lets code move focus to the status message", () => {
    const messageRef = { current: null as HTMLParagraphElement | null };
    setup({
      messageRef,
      buttonVisible: false,
      message: "Deleted 20 completed todos.",
      messageKind: "success",
    });

    messageRef.current?.focus();

    expect(screen.getByRole("status")).toHaveFocus();
  });
});
