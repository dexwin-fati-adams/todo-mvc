import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { okAsync } from "neverthrow";
import type { Todo } from "contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { todoApi } from "@/api/todo.api";

const LABEL = "What needs to be done?";

const milk: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

function listOf(todos: Todo[]) {
  return {
    todos,
    activeCount: todos.length,
    completedCount: 0,
    page: 1,
    pageSize: 20,
    totalItems: todos.length,
    totalPages: todos.length === 0 ? 0 : 1,
  };
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App create form", () => {
  it("shows the create form above the todo list", async () => {
    vi.spyOn(todoApi, "list").mockReturnValue(okAsync(listOf([milk])));

    renderApp();

    const field = screen.getByLabelText(LABEL);
    const item = await screen.findByText("Buy milk");
    expect(field.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("adds a todo and shows it in the refreshed list", async () => {
    vi.spyOn(todoApi, "list")
      .mockReturnValueOnce(okAsync(listOf([])))
      .mockReturnValue(okAsync(listOf([milk])));
    const create = vi.spyOn(todoApi, "create").mockReturnValue(okAsync(milk));
    renderApp();
    expect(await screen.findByText("No todos yet.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(LABEL), "Buy milk");
    await userEvent.click(screen.getByRole("button", { name: "Add todo" }));

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({ title: "Buy milk" });
    expect(screen.getByLabelText(LABEL)).toHaveValue("");
    expect(screen.getByLabelText(LABEL)).toHaveFocus();
  });

  it("makes no request for an empty title", async () => {
    vi.spyOn(todoApi, "list").mockReturnValue(okAsync(listOf([])));
    const create = vi.spyOn(todoApi, "create");
    renderApp();
    expect(await screen.findByText("No todos yet.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add todo" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title for your todo.");
    expect(create).not.toHaveBeenCalled();
  });
});
