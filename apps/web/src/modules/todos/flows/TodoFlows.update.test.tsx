import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok } from "neverthrow";
import type { Todo } from "contracts";
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

type HookResult = ReturnType<typeof useTodos>;

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

const complete = (n: number) =>
  screen.getByRole("button", {
    name: `Mark ${n} selected ${n === 1 ? "todo" : "todos"} as complete`,
  });
const toolbar = () => screen.getByRole("group", { name: "Selection mode" });
const countLine = () => within(toolbar()).getByRole("status");
const box = (todo: Todo) => screen.getByRole("checkbox", { name: `Select “${todo.title}”` });

async function selectRows(...todos: Todo[]) {
  await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
  for (const todo of todos) await userEvent.click(box(todo));
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
  updateSelected.mockResolvedValue(ok({ updatedCount: 2 }));
});

describe("TodoFlows: update selected todos", () => {
  // 83
  it("shows both buttons in the toolbar, disabled until something is selected", async () => {
    render(<TodoFlows />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    expect(within(toolbar()).getByRole("button", { name: /as complete$/ })).toBeDisabled();
    expect(within(toolbar()).getByRole("button", { name: /as active$/ })).toBeDisabled();

    await userEvent.click(box(t1));
    expect(within(toolbar()).getByRole("button", { name: /as complete$/ })).toBeEnabled();
  });

  it("sends the selected ids to the hook when a button is pressed", async () => {
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(complete(2));

    expect(updateSelected).toHaveBeenCalledTimes(1);
    expect(updateSelected).toHaveBeenCalledWith([t1.id, t2.id], true);
  });

  // 84
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

    await userEvent.click(complete(2));

    expect(updateSelected).toHaveBeenCalledTimes(1);
    expect(updateSelected).toHaveBeenCalledWith([t1.id, t4.id], true);
  });

  // 85
  it("after success the selection is empty and the success message shows", async () => {
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(complete(2));

    await waitFor(() =>
      expect(countLine()).toHaveTextContent(
        "0 of 100 selected. Marked 2 selected todos as complete.",
      ),
    );
    expect(box(t1)).not.toBeChecked();
    expect(within(toolbar()).getByRole("button", { name: /as complete$/ })).toBeDisabled();
  });

  // 86
  it("after a conflict removes the missing ids, and a retry sends only the rest", async () => {
    updateSelected.mockResolvedValueOnce(err({ type: "BATCH_CONFLICT", missingIds: [t2.id] }));
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(complete(2));

    await waitFor(() =>
      expect(countLine()).toHaveTextContent("Nothing was changed. 1 selected todo"),
    );
    expect(box(t1)).toBeChecked();
    expect(box(t2)).not.toBeChecked();

    await userEvent.click(complete(1));

    expect(updateSelected).toHaveBeenLastCalledWith([t1.id], true);
  });

  // 87
  it("after a failure keeps the selection and shows the alert", async () => {
    updateSelected.mockResolvedValueOnce(err({ type: "API_ERROR", status: 503, message: "Down" }));
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(complete(2));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update the selected todos. Please try again.",
    );
    expect(box(t1)).toBeChecked();
    expect(box(t2)).toBeChecked();
  });

  // 88
  it("keeps Toggle all and Clear completed hidden in selection mode", async () => {
    render(<TodoFlows />);
    await selectRows(t1);

    expect(screen.queryByRole("checkbox", { name: /mark all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
  });

  it("makes the row selection checkboxes inert while the request runs", async () => {
    let release!: (value: ReturnType<typeof ok>) => void;
    updateSelected.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<TodoFlows />);
    await selectRows(t1, t2);

    await userEvent.click(complete(2));
    const third = box(t3);
    expect(third.hasAttribute("disabled") || third.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    await userEvent.click(third);

    expect(countLine()).toHaveTextContent("Updating 2 selected todos…");
    release(ok({ updatedCount: 2 }));
    await waitFor(() => expect(countLine()).toHaveTextContent("Marked 2 selected todos"));
  });
});
