import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionCheckbox, SelectionCheckboxProps } from "./SelectionCheckBox";

function setup(overrides: Partial<SelectionCheckboxProps> = {}) {
  const onChange = vi.fn();
  const props: SelectionCheckboxProps = {
    label: "Select “Buy milk”",
    checked: false,
    disabled: false,
    onChange,
    ...overrides,
  };
  render(<SelectionCheckbox {...props} />);
  return { onChange };
}

describe("SelectionCheckbox", () => {
  // 46
  it("is a checkbox with the given accessible name", () => {
    setup();

    expect(screen.getByRole("checkbox", { name: "Select “Buy milk”" })).toBeInTheDocument();
  });

  it("is not named by the todo title alone, so it never matches the completion checkbox", () => {
    setup();

    expect(screen.queryByRole("checkbox", { name: "Buy milk" })).not.toBeInTheDocument();
  });

  it("follows the checked prop", () => {
    const { rerender } = render(
      <SelectionCheckbox label="Select “A”" checked={false} disabled={false} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    rerender(<SelectionCheckbox label="Select “A”" checked disabled={false} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("calls onChange once on a click", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange once on Space", async () => {
    const { onChange } = setup();
    screen.getByRole("checkbox").focus();

    await userEvent.keyboard(" ");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("is marked aria-disabled when told, and a click calls nothing", async () => {
    const { onChange } = setup({ disabled: true });
    const checkbox = screen.getByRole("checkbox");

    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(checkbox);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays enabled when it is checked and not disabled, so the user can unselect it", async () => {
    const { onChange } = setup({ checked: true });
    const checkbox = screen.getByRole("checkbox");

    expect(checkbox).toBeEnabled();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // 47
  it("has the focus ring classes", () => {
    setup();

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.className).toContain("focus-visible:outline-2");
    expect(checkbox.className).toContain("focus-visible:outline-blue-600");
  });
});
