import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SelectionControls,
  type SelectionControlsProps,
} from "@/modules/todos/components/SelectionControls";

const HELP = "Selecting a todo does not change whether it is complete.";
const SELECT_PAGE = "Select all 20 todos on this page";

function setup(overrides: Partial<SelectionControlsProps> = {}) {
  const handlers = {
    onEnter: vi.fn(),
    onExit: vi.fn(),
    onSelectVisible: vi.fn(),
    onClear: vi.fn(),
  };
  const props: SelectionControlsProps = {
    visible: true,
    active: true,
    entryDisabled: false,
    countText: "3 of 100 selected",
    selectVisibleLabel: SELECT_PAGE,
    selectVisibleDisabled: false,
    clearDisabled: false,
    ...handlers,
    ...overrides,
  };
  const view = render(<SelectionControls {...props} />);
  return { ...handlers, container: view.container };
}

describe("SelectionControls", () => {
  // 33
  it("with the mode off, renders only the Select todos button", () => {
    setup({ active: false });

    expect(screen.getByRole("button", { name: "Select todos" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 34
  it("renders nothing when it is not visible", () => {
    const { container } = setup({ visible: false, active: false });

    expect(container).toBeEmptyDOMElement();
  });

  // 35
  it("gives the entry button the real disabled attribute, and a click calls nothing", async () => {
    const { onEnter } = setup({ active: false, entryDisabled: true });
    const entry = screen.getByRole("button", { name: "Select todos" });

    expect(entry).toBeDisabled();
    await userEvent.click(entry);

    expect(onEnter).not.toHaveBeenCalled();
  });

  // 36
  it("calls onEnter once for a click, once for Enter, and once for Space", async () => {
    const { onEnter } = setup({ active: false });
    const entry = screen.getByRole("button", { name: "Select todos" });

    await userEvent.click(entry);
    expect(onEnter).toHaveBeenCalledTimes(1);

    entry.focus();
    await userEvent.keyboard("{Enter}");
    expect(onEnter).toHaveBeenCalledTimes(2);

    await userEvent.keyboard(" ");
    expect(onEnter).toHaveBeenCalledTimes(3);
  });

  // 37
  it("with the mode on, renders a group named Selection mode with the count and three buttons", () => {
    setup();

    const group = screen.getByRole("group", { name: "Selection mode" });
    expect(within(group).getByText("3 of 100 selected")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: SELECT_PAGE })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Done selecting" })).toBeInTheDocument();
  });

  // 38
  it("puts the count line in the only status region, and renders no alert", () => {
    setup();

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("3 of 100 selected");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 39
  it("shows the select-page label, honours disabled, and calls onSelectVisible once on click", async () => {
    const { onSelectVisible } = setup({ selectVisibleLabel: "Select the 1 todo on this page" });
    const button = screen.getByRole("button", { name: "Select the 1 todo on this page" });

    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onSelectVisible).toHaveBeenCalledTimes(1);
  });

  it("gives the select-page button the real disabled attribute, and a click calls nothing", async () => {
    const { onSelectVisible } = setup({ selectVisibleDisabled: true });
    const button = screen.getByRole("button", { name: SELECT_PAGE });

    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onSelectVisible).not.toHaveBeenCalled();
  });

  // 40
  it("calls onClear once on click, and is really disabled when told", async () => {
    const { onClear } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("gives Clear selection the real disabled attribute, and a click calls nothing", async () => {
    const { onClear } = setup({ clearDisabled: true });
    const button = screen.getByRole("button", { name: "Clear selection" });

    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onClear).not.toHaveBeenCalled();
  });

  // 41
  it("calls onExit once when Done selecting is clicked", async () => {
    const { onExit } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Done selecting" }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // 42
  it("shows the help text and describes the group with it", () => {
    setup();

    expect(screen.getByText(HELP)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Selection mode" })).toHaveAccessibleDescription(HELP);
  });

  // 43
  it("gives every button the focus ring classes", () => {
    setup();

    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("focus-visible:outline-2");
      expect(button.className).toContain("focus-visible:outline-blue-600");
    }
  });

  it("gives the entry button the focus ring classes too", () => {
    setup({ active: false });

    const button = screen.getByRole("button", { name: "Select todos" });
    expect(button.className).toContain("focus-visible:outline-2");
    expect(button.className).toContain("focus-visible:outline-blue-600");
  });

  // 44
  it("lets the count line take focus, and gives the refs their real elements", () => {
    const countRef = createRef<HTMLParagraphElement>();
    setup({ countRef });

    const count = screen.getByRole("status");
    expect(count).toHaveAttribute("tabindex", "-1");
    expect(countRef.current).toBe(count);
  });

  it("gives the entry ref the real Select todos button", () => {
    const entryRef = createRef<HTMLButtonElement>();
    setup({ active: false, entryRef });

    expect(entryRef.current).toBe(screen.getByRole("button", { name: "Select todos" }));
  });

  // 45
  it("has one group and exactly three named buttons in the toolbar, with no entry button", () => {
    setup();

    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      SELECT_PAGE,
      "Clear selection",
      "Done selecting",
    ]);
    expect(screen.queryByRole("button", { name: "Select todos" })).not.toBeInTheDocument();
  });

  it("keeps the toolbar visible with no rows, so the user can clear or exit", () => {
    setup({ countText: "0 of 100 selected", selectVisibleDisabled: true, clearDisabled: true });

    expect(screen.getByRole("group", { name: "Selection mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done selecting" })).toBeEnabled();
  });
});
