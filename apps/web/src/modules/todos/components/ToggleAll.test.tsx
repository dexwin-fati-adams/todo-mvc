import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToggleAll, type ToggleAllProps } from "@/modules/todos/components/ToggleAll";

const HELP = "This changes every todo, including other pages and filters.";

function setup(overrides: Partial<ToggleAllProps> = {}) {
  const onToggle = vi.fn();
  const props: ToggleAllProps = {
    visible: true,
    checked: false,
    disabled: false,
    label: "Mark all 45 todos as complete",
    helpText: HELP,
    message: "",
    messageKind: null,
    onToggle,
    ...overrides,
  };
  render(<ToggleAll {...props} />);
  return { onToggle };
}

describe("ToggleAll", () => {
  // 21
  it("renders a checkbox whose accessible name is the label", () => {
    setup();

    const checkbox = screen.getByRole("checkbox", { name: "Mark all 45 todos as complete" });
    expect(checkbox).toBeInTheDocument();
    // The label is connected with htmlFor, so clicking the words also reaches the checkbox.
    expect(screen.getByLabelText("Mark all 45 todos as complete")).toBe(checkbox);
  });

  // 22
  it("shows the help text and describes the checkbox with it", () => {
    setup();

    expect(screen.getByText(HELP)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(HELP);
  });

  // 23
  it("is checked when checked is true and unchecked when it is false", () => {
    setup({ checked: true, label: "Mark all 45 todos as active" });
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("is unchecked when checked is false", () => {
    setup({ checked: false });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  // 24
  it("calls onToggle once when it is clicked", async () => {
    const { onToggle } = setup();

    await userEvent.click(screen.getByRole("checkbox"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle once when the label is clicked", async () => {
    const { onToggle } = setup();

    await userEvent.click(screen.getByText("Mark all 45 todos as complete"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // 25
  it("calls onToggle once when Space is pressed on the focused checkbox", async () => {
    const { onToggle } = setup();

    await userEvent.tab();
    expect(screen.getByRole("checkbox")).toHaveFocus();
    await userEvent.keyboard(" ");

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // 26
  it("has the real disabled attribute and calls nothing when disabled", async () => {
    const { onToggle } = setup({ disabled: true });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
    await userEvent.click(checkbox);

    expect(onToggle).not.toHaveBeenCalled();
  });

  // 27
  it("renders nothing when it is not visible", () => {
    setup({ visible: false });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(HELP)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 28
  it("shows a success message in the status region and nothing in the alert region", () => {
    setup({ message: "Marked 45 todos as complete.", messageKind: "success" });

    expect(screen.getByRole("status")).toHaveTextContent("Marked 45 todos as complete.");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("shows a failure message in the alert region and nothing in the status region", () => {
    setup({
      message: "Could not update all todos. Please try again.",
      messageKind: "failure",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not update all todos. Please try again.",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps both live regions on the page, empty, when there is no message", () => {
    setup();

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  // 29
  it("is marked busy and shows the updating text while pending", () => {
    const { container } = render(
      <ToggleAll
        visible
        checked={false}
        disabled
        label="Mark all 45 todos as complete"
        helpText={HELP}
        message="Updating all todos…"
        messageKind="pending"
        onToggle={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Updating all todos…");
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("is not marked busy when it is disabled for another reason", () => {
    const { container } = render(
      <ToggleAll
        visible
        checked={false}
        disabled
        label="Mark all 45 todos as complete"
        helpText={HELP}
        message=""
        messageKind={null}
        onToggle={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "false");
  });

  // 30
  it("has a focus ring class on the checkbox", () => {
    setup();

    expect(screen.getByRole("checkbox")).toHaveClass("focus-visible:outline-2");
    expect(screen.getByRole("checkbox")).toHaveClass("focus-visible:outline-blue-600");
  });

  // 31 Plan test 31 said "axe". The project has no axe library, so this checks the same accessible structure by hand instead.
  it("has a correct accessible structure: one named checkbox, one description, two live regions", () => {
    setup({ message: "Marked 45 todos as complete.", messageKind: "success" });

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox")).toHaveAccessibleName("Mark all 45 todos as complete");
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(HELP);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("gives the checkbox to the inputRef so the flow can put focus back on it", () => {
    const inputRef = { current: null as HTMLInputElement | null };
    render(
      <ToggleAll
        visible
        checked={false}
        disabled={false}
        label="Mark all 45 todos as complete"
        helpText={HELP}
        message=""
        messageKind={null}
        inputRef={inputRef}
        onToggle={vi.fn()}
      />,
    );

    expect(inputRef.current).toBe(screen.getByRole("checkbox"));
  });
});
