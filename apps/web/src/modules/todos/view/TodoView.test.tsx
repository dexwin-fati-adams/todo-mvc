import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { Todo } from "contracts";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todos/todo.api";
import type { TodoEditing } from "@/modules/todos/components/TodoItem";
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

function editingProps(props: Partial<TodoEditing> = {}): TodoEditing {
  return {
    activeId: null,
    draft: "",
    status: "idle",
    message: null,
    inputRef: createRef<HTMLInputElement>(),
    setEditButton: vi.fn(() => vi.fn()),
    onStart: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
}

function renderEditingActive(props: Partial<TodoEditing> = {}) {
  const editing = editingProps({ activeId: active.id, draft: "Buy milk", ...props });
  const utils = renderView({ editing });
  return { ...utils, editing };
}

const editName = (title: string) => `Edit “${title}”`;

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

describe("TodoView inline editing", () => {
  it("shows no Edit button when the list is not wired for editing", () => {
    renderView();

    expect(screen.queryByRole("button", { name: /^edit/i })).not.toBeInTheDocument();
  });

  it("shows an Edit button for each row and starts editing the row it belongs to", async () => {
    const editing = editingProps();
    renderView({ editing });

    await userEvent.click(screen.getByRole("button", { name: editName("Buy milk") }));

    expect(screen.getByRole("button", { name: editName("Walk the dog") })).toBeInTheDocument();
    expect(editing.onStart).toHaveBeenCalledTimes(1);
    expect(editing.onStart).toHaveBeenCalledWith(active);
  });

  it("registers each row's Edit button by todo id", () => {
    const editing = editingProps();
    renderView({ editing });

    expect(editing.setEditButton).toHaveBeenCalledWith(active.id);
    expect(editing.setEditButton).toHaveBeenCalledWith(done.id);
  });

  it("double-clicking a title starts editing without toggling the todo", async () => {
    const editing = editingProps();
    const { onToggle } = renderView({ editing });

    await userEvent.dblClick(screen.getByText("Buy milk"));

    expect(editing.onStart).toHaveBeenCalledWith(active);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows the editor only for the row being edited", () => {
    renderEditingActive();

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    const [first, second] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(first!).getByRole("textbox")).toHaveValue("Buy milk");
    expect(within(second!).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(first!).queryByRole("button", { name: editName("Buy milk") })).toBeNull();
    expect(within(second!).getByRole("button", { name: editName("Walk the dog") })).toBeVisible();
  });

  it("labels the field with the original title", () => {
    renderEditingActive();

    expect(screen.getByRole("textbox", { name: "Edit title of “Buy milk”" })).toBeInTheDocument();
  });

  it("keeps the row's checkbox named by the title while it is being edited", () => {
    renderEditingActive();

    expect(screen.getByRole("checkbox", { name: "Buy milk" })).toBeInTheDocument();
  });

  it("blocks Edit on other rows while one row is being edited", async () => {
    const { editing } = renderEditingActive();
    const other = screen.getByRole("button", { name: editName("Walk the dog") });

    expect(other).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(other);
    await userEvent.dblClick(screen.getByText("Walk the dog"));

    expect(editing.onStart).not.toHaveBeenCalled();
  });

  it("blocks Edit on a row whose toggle is pending", async () => {
    const editing = editingProps();
    renderView({ editing, pendingIds: new Set([active.id]) });
    const edit = screen.getByRole("button", { name: editName("Buy milk") });

    expect(edit).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(edit);
    await userEvent.dblClick(screen.getByText("Buy milk"));

    expect(editing.onStart).not.toHaveBeenCalled();
  });

  it("blocks the checkbox while its row is being saved", async () => {
    const { onToggle } = renderEditingActive({ status: "pending" });

    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(checkbox);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("does not block the checkbox of another row while a row is being saved", async () => {
    const { onToggle } = renderEditingActive({ status: "pending" });

    await userEvent.click(screen.getByRole("checkbox", { name: "Walk the dog" }));

    expect(onToggle).toHaveBeenCalledWith(done);
  });

  it("passes typing, Enter and Escape from the field to the flow", async () => {
    const { editing } = renderEditingActive();
    const field = screen.getByRole("textbox");

    await userEvent.type(field, "x");
    expect(editing.onDraftChange).toHaveBeenLastCalledWith("Buy milkx");

    await userEvent.type(field, "{Enter}");
    expect(editing.onSave).toHaveBeenCalledTimes(1);

    await userEvent.type(field, "{Escape}");
    expect(editing.onCancel).toHaveBeenCalledTimes(1);
  });

  it("the Save and Cancel buttons call their handlers", async () => {
    const { editing } = renderEditingActive();

    await userEvent.click(screen.getByRole("button", { name: /^save/i }));
    await userEvent.click(screen.getByRole("button", { name: /^cancel/i }));

    expect(editing.onSave).toHaveBeenCalledTimes(1);
    expect(editing.onCancel).toHaveBeenCalledTimes(1);
  });

  it("pending makes the field read-only, blocks the buttons by aria, and shows Saving…", () => {
    renderEditingActive({ status: "pending" });

    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Saving…")).toBe(true);
  });

  it("pending keeps the field and buttons in the tab order", () => {
    renderEditingActive({ status: "pending" });

    expect(screen.getByRole("textbox")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
  });

  it("shows a validation message with aria-invalid, linked to the field", () => {
    renderEditingActive({ status: "invalid", message: "Enter a title." });

    const field = screen.getByRole("textbox");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Enter a title.");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title.");
  });

  it("is not marked invalid when idle", () => {
    renderEditingActive();

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  });

  it("a failed save uses role=alert and keeps the draft", () => {
    renderEditingActive({
      status: "failed",
      draft: "My draft",
      message: "Could not save. Try again.",
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(screen.getByRole("textbox")).toHaveValue("My draft");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  });

  it.each<{ name: string; next: Partial<TodoViewProps> }>([
    { name: "refreshing", next: { state: "refreshing" } },
    { name: "refresh-failure", next: { state: "refresh-failure", error: networkError } },
  ])("keeps the same Edit button and its focus when ready becomes $name", ({ next }) => {
    const editing = editingProps();
    const { rerender } = render(<TodoView {...viewProps({ editing })} />);
    const button = screen.getByRole("button", { name: editName("Buy milk") });
    button.focus();

    rerender(<TodoView {...viewProps({ editing, ...next })} />);

    const after = screen.getByRole("button", { name: editName("Buy milk") });
    expect(after).toBe(button);
    expect(after).toHaveFocus();
  });
});

describe("TodoView accessibility", () => {
  const editingActive = (props: Partial<TodoEditing> = {}) =>
    editingProps({ activeId: active.id, draft: "Buy milk", ...props });

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
    { name: "ready with Edit buttons", props: { editing: editingProps() } },
    {
      name: "ready with Edit blocked on one row",
      props: { editing: editingProps(), pendingIds: new Set([active.id]) },
    },
    { name: "editing", props: { editing: editingActive() } },
    {
      name: "editing, invalid",
      props: {
        editing: editingActive({ draft: "", status: "invalid", message: "Enter a title." }),
      },
    },
    { name: "editing, pending", props: { editing: editingActive({ status: "pending" }) } },
    {
      name: "editing, failed",
      props: {
        editing: editingActive({ status: "failed", message: "Could not save. Try again." }),
      },
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