import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { DeleteBatchResponse, Todo } from "contracts";
import type { DeleteBatchError } from "@/api/todos/todo.api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTodos } from "@/modules/todos/hooks/useTodos";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";
import { useReplaceTodo } from "@/modules/todos/hooks/useReplaceTodo";
import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

vi.mock("@/modules/todos/hooks/useTodos");
vi.mock("@/modules/todos/hooks/useToggleTodo");
vi.mock("@/modules/todos/hooks/useDeleteTodo");
vi.mock("@/modules/todos/hooks/useReplaceTodo");
vi.mock("@/modules/todos/hooks/useClearCompleted", () => ({
  useClearCompleted: () => ({
    clear: vi.fn().mockResolvedValue(ok({ deletedCount: 0 })),
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/modules/todos/hooks/useSetAllCompleted", () => ({
  useSetAllCompleted: () => ({ setAll: vi.fn().mockResolvedValue(ok({ updatedCount: 0 })) }),
}));
const { updateSelected } = vi.hoisted(() => ({ updateSelected: vi.fn() }));
vi.mock("@/modules/todos/hooks/useUpdateSelected", () => ({
  useUpdateSelected: () => ({ update: updateSelected, refresh: vi.fn() }),
}));
const { deleteSelected } = vi.hoisted(() => ({ deleteSelected: vi.fn() }));
vi.mock("@/modules/todos/hooks/useDeleteSelected", () => ({
  useDeleteSelected: () => ({ remove: deleteSelected, refresh: vi.fn() }),
}));

type HookResult = ReturnType<typeof useTodos>;
type Outcome = Result<DeleteBatchResponse, DeleteBatchError>;

const make = (n: number, completed = false): Todo => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  title: `Todo ${n}`,
  completed,
  createdAt: "2026-09-29T10:00:00.000Z",
});
const t1 = make(1);
const t2 = make(2);
const t3 = make(3);
const t4 = make(4);

function hookResult(overrides: Partial<HookResult>): HookResult {
  return {
    serverState: "ready",
    error: null,
    refetch: vi.fn(),
    todos: [],
    counts: { active: 4, completed: 0 },
    pagination: null,
    ...overrides,
  };
}

const toolbar = () => screen.getByRole("group", { name: "Selection mode" });
const countLine = () => within(toolbar()).getByRole("status");
const box = (todo: Todo) => screen.getByRole("checkbox", { name: `Select “${todo.title}”` });
const deleteButton = (n: number) =>
  within(toolbar()).getByRole("button", {
    name: `Delete ${n} selected ${n === 1 ? "todo" : "todos"}`,
  });
const confirmButton = (n: number) =>
  within(toolbar()).getByRole("button", {
    name: `Yes, delete ${n} ${n === 1 ? "todo" : "todos"}`,
  });

async function selectRows(...todos: Todo[]) {
  await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
  for (const todo of todos) await userEvent.click(box(todo));
}

async function deleteAndConfirm(n: number) {
  await userEvent.click(deleteButton(n));
  await userEvent.click(confirmButton(n));
}

function deferred() {
  let resolve!: (outcome: Outcome) => void;
  const promise = new Promise<Outcome>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.mocked(useTodos).mockReset();
  vi.mocked(useTodos).mockReturnValue(hookResult({ todos: [t1, t2, t3] }));
  vi.mocked(useToggleTodo).mockReturnValue({ toggle: vi.fn().mockResolvedValue(ok(t1)) });
  vi.mocked(useDeleteTodo).mockReturnValue({ remove: vi.fn().mockResolvedValue(ok(undefined)) });
  vi.mocked(useReplaceTodo).mockReturnValue({
    replace: vi.fn().mockResolvedValue(ok(t1)),
    refresh: vi.fn().mockResolvedValue(undefined),
  });
  updateSelected.mockReset();
  deleteSelected.mockReset();
  deleteSelected.mockResolvedValue(ok({ deletedCount: 2 }));
});

describe("TodoFlows: delete selected todos", () => {
  // 51
  it("shows the delete button in the toolbar, disabled until something is selected", async () => {
    render(<TodoFlows />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    expect(deleteButton(0)).toBeDisabled();
    await userEvent.click(box(t1));
    expect(deleteButton(1)).toBeEnabled();
    expect(within(toolbar()).getByText("Deleting cannot be undone.")).toBeInTheDocument();
  });

  it("opens the confirmation on the first press and sends nothing until confirm", async () => {
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(deleteButton(2));

    expect(
      within(toolbar()).getByText("Delete 2 selected todos? This cannot be undone."),
    ).toBeInTheDocument();
    expect(within(toolbar()).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(deleteSelected).not.toHaveBeenCalled();

    await userEvent.click(confirmButton(2));
    expect(deleteSelected).toHaveBeenCalledTimes(1);
    expect(deleteSelected).toHaveBeenCalledWith([t1.id, t2.id]);
  });

  it("Cancel closes the confirmation and sends nothing", async () => {
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(deleteButton(2));
    await userEvent.click(within(toolbar()).getByRole("button", { name: "Cancel" }));

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(within(toolbar()).queryByText(/This cannot be undone/)).not.toBeInTheDocument();
    expect(deleteButton(2)).toBeEnabled();
  });

  // 52
  it("sends one request that carries ids selected on two different pages", async () => {
    const pageInfo = (page: number) => ({
      page,
      pageSize: 20 as const,
      totalItems: 40,
      totalPages: 2,
    });
    vi.mocked(useTodos).mockImplementation((query) =>
      (query?.page ?? 1) === 1
        ? hookResult({ todos: [t1], pagination: pageInfo(1) })
        : hookResult({ todos: [t4], pagination: pageInfo(2) }),
    );
    render(<TodoFlows />);
    await selectRows(t1);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await userEvent.click(box(t4));

    await deleteAndConfirm(2);

    expect(deleteSelected).toHaveBeenCalledTimes(1);
    expect(deleteSelected).toHaveBeenCalledWith([t1.id, t4.id]);
  });

  // 53
  it("after success the selection is empty and the success message shows", async () => {
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await deleteAndConfirm(2);

    await waitFor(() => expect(countLine()).toHaveTextContent("Deleted 2 selected todos."));
    expect(deleteButton(0)).toBeDisabled();
    expect(within(toolbar()).queryByText(/This cannot be undone/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 54
  it("after a conflict removes the missing ids, and a retry sends only the rest", async () => {
    deleteSelected.mockResolvedValueOnce(
      err({ type: "BATCH_CONFLICT", missingIds: [t1.id] } as DeleteBatchError),
    );
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await deleteAndConfirm(2);

    await waitFor(() =>
      expect(countLine()).toHaveTextContent(
        "Nothing was deleted. 1 selected todo no longer exists and was removed from the selection.",
      ),
    );
    expect(deleteSelected).toHaveBeenCalledTimes(1);
    expect(deleteButton(1)).toBeEnabled();

    await deleteAndConfirm(1);

    expect(deleteSelected).toHaveBeenCalledTimes(2);
    expect(deleteSelected).toHaveBeenLastCalledWith([t2.id]);
  });

  // 55
  it("after a failure keeps the selection and shows the alert", async () => {
    deleteSelected.mockResolvedValueOnce(
      err({ type: "API_ERROR", status: 503, message: "Down" } as DeleteBatchError),
    );
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await deleteAndConfirm(2);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not delete the selected todos. Please try again.");
    expect(alert).not.toHaveTextContent(/503|Down/);
    expect(deleteButton(2)).toBeEnabled();
    expect(box(t1)).toBeChecked();
    expect(box(t2)).toBeChecked();
  });

  // 56
  it("keeps Toggle all and Clear completed hidden in selection mode", async () => {
    render(<TodoFlows />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    expect(screen.queryByRole("button", { name: /clear completed/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /toggle all|mark all/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /toggle all|mark all/i })).not.toBeInTheDocument();
  });

  // 57
  it("makes the row selection checkboxes inert while the request runs", async () => {
    const pending = deferred();
    deleteSelected.mockReturnValue(pending.promise);
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await deleteAndConfirm(2);

    expect(countLine()).toHaveTextContent("Deleting 2 selected todos…");
    expect(box(t1)).toHaveAttribute("aria-disabled", "true");
    expect(box(t3)).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(toolbar()).getByRole("button", { name: "Done selecting" }));
    expect(toolbar()).toBeInTheDocument();

    await act(async () => {
      pending.resolve(ok({ deletedCount: 2 }));
    });
    await waitFor(() => expect(countLine()).toHaveTextContent("Deleted 2 selected todos."));
  });
});
