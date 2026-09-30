import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { okAsync } from "neverthrow";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import { todoApi } from "@/modules/todos/todo.api";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

const emptyList = {
  todos: [],
  activeCount: 0,
  completedCount: 0,
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

describe("App shell", () => {
  it("has one h1 and a main landmark", () => {
    vi.spyOn(todoApi, "list").mockReturnValue(okAsync(emptyList));

    renderApp();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("shows the todos from the API", async () => {
    vi.spyOn(todoApi, "list").mockReturnValue(
      okAsync({
        ...emptyList,
        todos: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Buy milk",
            completed: false,
            createdAt: "2026-09-29T10:00:00.000Z",
          },
        ],
        activeCount: 1,
        totalItems: 1,
        totalPages: 1,
      }),
    );

    renderApp();

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });
});
