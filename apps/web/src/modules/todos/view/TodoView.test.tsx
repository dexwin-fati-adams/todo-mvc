import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { Todo } from "contracts";
import { describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todos/todo.api";
import { TodoView, type TodoViewProps } from "@/modules/todos/view/TodoView";

const active: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const done: Todo = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Walk the dog",
  completed: true,
  createdAt: "2026-09-29T11:00:00.000Z",
};

const networkError: ClientError = { type: "NETWORK_ERROR", message: "secret-internal-detail" };

function viewProps(props: Partial<TodoViewProps> = {}): TodoViewProps {
  return {
    state: "ready",
    todos: [active, done],
    error: null,
    onRetry: vi.fn(),
    onToggle: vi.fn(),
    pendingIds: new Set(),
    rowMessages: {},
    ...props,
  };
}

function renderView(props: Partial<TodoViewProps> = {}) {
  const onRetry = vi.fn();
  const onToggle = vi.fn();
  const utils = render(<TodoView {...viewProps({ onRetry, onToggle, ...props })} />);
  return { ...utils, onRetry, onToggle };
}

describe("TodoView", () => {
  it("initial-loading shows a status message and no list", () => {
    renderView({ state: "initial-loading", todos: [] });

    expect(screen.getByRole("status")).toHaveTextContent(/loading todos/i);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("empty shows a clear message and no list", () => {
    renderView({ state: "empty", todos: [] });

    expect(screen.getByText(/no todos yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("ready shows one list item for each todo", () => {
    renderView();

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Buy milk");
    expect(items[1]).toHaveTextContent("Walk the dog");
  });

  it("marks completed todos with a checked checkbox, not only by style", () => {
    renderView();

    expect(screen.getByRole("checkbox", { name: "Buy milk" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Walk the dog" })).toBeChecked();
  });

  it("initial-failure shows an alert and Retry, and hides the list", async () => {
    const { onRetry } = renderView({ state: "initial-failure", todos: [], error: networkError });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("never shows raw error details to the user", () => {
    renderView({ state: "initial-failure", todos: [], error: networkError });

    expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
  });

  it("refreshing keeps the todos visible and shows a status message", () => {
    const { container } = renderView({ state: "refreshing" });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(/refreshing/i);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("refresh-failure keeps the todos visible and shows an alert with Retry", async () => {
    const { onRetry } = renderView({ state: "refresh-failure", error: networkError });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("TodoView completion checkbox", () => {
  it("passes onToggle through to the row checkbox", async () => {
    const { onToggle } = renderView();

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(onToggle).toHaveBeenCalledWith(active);
  });

  it("shows Updating… and blocks the checkbox for a pending row", async () => {
    const { onToggle } = renderView({ pendingIds: new Set([active.id]) });

    expect(screen.getByRole("status")).toHaveTextContent("Updating…");
    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows the row message for the row it belongs to", () => {
    renderView({ rowMessages: { [active.id]: "Could not update this todo. Try again." } });

    const [first, second] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(first!).getByRole("alert")).toHaveTextContent(
      "Could not update this todo. Try again.",
    );
    expect(within(second!).queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each<{ name: string; next: Partial<TodoViewProps> }>([
    { name: "refreshing", next: { state: "refreshing" } },
    { name: "refresh-failure", next: { state: "refresh-failure", error: networkError } },
  ])("keeps the same checkbox element and its focus when ready becomes $name", ({ next }) => {
    const onToggle = vi.fn();
    const { rerender } = render(<TodoView {...viewProps({ onToggle })} />);
    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });
    checkbox.focus();
    expect(checkbox).toHaveFocus();

    rerender(<TodoView {...viewProps({ onToggle, ...next })} />);

    const after = screen.getByRole("checkbox", { name: "Buy milk" });
    expect(after).toBe(checkbox);
    expect(after).toHaveFocus();
  });

  it("keeps the same checkbox element and its focus when refreshing becomes ready", () => {
    const { rerender } = render(<TodoView {...viewProps({ state: "refreshing" })} />);
    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });
    checkbox.focus();

    rerender(<TodoView {...viewProps({ state: "ready" })} />);

    const after = screen.getByRole("checkbox", { name: "Buy milk" });
    expect(after).toBe(checkbox);
    expect(after).toHaveFocus();
  });
});

describe("TodoView accessibility", () => {
  const cases: { name: string; props: Partial<TodoViewProps> }[] = [
    { name: "initial-loading", props: { state: "initial-loading", todos: [] } },
    {
      name: "initial-failure",
      props: { state: "initial-failure", todos: [], error: networkError },
    },
    { name: "empty", props: { state: "empty", todos: [] } },
    { name: "ready", props: { state: "ready" } },
    { name: "refreshing", props: { state: "refreshing" } },
    { name: "refresh-failure", props: { state: "refresh-failure", error: networkError } },
    { name: "ready with a pending row", props: { pendingIds: new Set([active.id]) } },
    {
      name: "ready with a row message",
      props: { rowMessages: { [active.id]: "Could not update this todo. Try again." } },
    },
  ];

  it.each(cases)("$name has no axe violations", async ({ props }) => {
    const { container } = renderView(props);

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, "color-contrast": { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});
