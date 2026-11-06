import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectionCheckbox } from "./SelectionCheckbox";

describe("SelectionCheckbox: limit state (aria-disabled)", () => {
  it("is not natively disabled, so it stays in the Tab order and can take focus", () => {
    render(
      <SelectionCheckbox label="Select “Buy milk”" checked={false} disabled onChange={vi.fn()} />,
    );
    const box = screen.getByRole("checkbox", { name: "Select “Buy milk”" });

    expect(box).not.toBeDisabled();
    expect(box).toHaveAttribute("aria-disabled", "true");
    box.focus();
    expect(box).toHaveFocus();
  });

  it("ignores a click while disabled", async () => {
    const onChange = vi.fn();
    render(
      <SelectionCheckbox label="Select “Buy milk”" checked={false} disabled onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Select “Buy milk”" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Select “Buy milk”" })).not.toBeChecked();
  });

  it("calls onChange once when enabled, and says aria-disabled false", async () => {
    const onChange = vi.fn();
    render(
      <SelectionCheckbox
        label="Select “Buy milk”"
        checked={false}
        disabled={false}
        onChange={onChange}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Select “Buy milk”" });

    await userEvent.click(box);

    expect(box).toHaveAttribute("aria-disabled", "false");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
