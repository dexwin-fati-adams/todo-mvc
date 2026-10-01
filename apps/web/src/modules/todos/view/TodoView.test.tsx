import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { Todo } from "contracts";
import { describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todo.api";
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

function renderView(props: Partial<TodoViewProps> = {}) {
  const onRetry = vi.fn();
  const utils = render(
    <TodoView state="ready" todos={[active, done]} error={null} onRetry={onRetry} {...props} />,
  );
  return { ...utils, onRetry };
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

  it("marks completed todos in text, not only by style", () => {
    renderView();

    const [first, second] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(first).not.toHaveTextContent(/completed/i);
    expect(second).toHaveTextContent(/completed/i);
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
  ];

  it.each(cases)("$name has no axe violations", async ({ props }) => {
    const { container } = renderView(props);

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, "color-contrast": { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});
