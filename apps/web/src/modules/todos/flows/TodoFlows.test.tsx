import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTodos, type TodoServerState } from "@/modules/todos/hooks/useTodos";
import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

vi.mock("@/modules/todos/hooks/useTodos");

type HookResult = ReturnType<typeof useTodos>;

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

function givenHook(overrides: Partial<HookResult>) {
  const result: HookResult = {
    serverState: "ready",
    error: null,
    refetch: vi.fn(),
    todos: [],
    ...overrides,
  };
  vi.mocked(useTodos).mockReturnValue(result);
  return result;
}

beforeEach(() => {
  vi.mocked(useTodos).mockReset();
});

describe("TodoFlows", () => {
  it("renders the loading message for initial-loading", () => {
    givenHook({ serverState: "initial-loading" });
    render(<TodoFlows />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading todos/i);
  });

  it("renders the empty message for empty", () => {
    givenHook({ serverState: "empty" });
    render(<TodoFlows />);
    expect(screen.getByText(/no todos yet/i)).toBeInTheDocument();
  });

  it("renders the todos for ready", () => {
    givenHook({ serverState: "ready", todos: [todo] });
    render(<TodoFlows />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("renders an alert and no list for initial-failure", () => {
    givenHook({
      serverState: "initial-failure",
      error: { type: "NETWORK_ERROR", message: "Failed to fetch" },
    });
    render(<TodoFlows />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("keeps the todos and shows a status for refreshing", () => {
    givenHook({ serverState: "refreshing", todos: [todo] });
    render(<TodoFlows />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/refreshing/i);
  });

  it("keeps the todos and shows an alert for refresh-failure", () => {
    givenHook({
      serverState: "refresh-failure",
      todos: [todo],
      error: { type: "NETWORK_ERROR", message: "Failed to fetch" },
    });
    render(<TodoFlows />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("calls refetch when the user presses Retry", async () => {
    const hook = givenHook({
      serverState: "initial-failure",
      error: { type: "NETWORK_ERROR", message: "Failed to fetch" },
    });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(hook.refetch).toHaveBeenCalledTimes(1);
  });

  it("asks the hook for all todos by default", () => {
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith("all");
  });

  it("passes a given status to the hook", () => {
    givenHook({});
    render(<TodoFlows status="active" />);
    expect(useTodos).toHaveBeenCalledWith("active");
  });

  it.each<TodoServerState>([
    "initial-loading",
    "initial-failure",
    "empty",
    "ready",
    "refreshing",
    "refresh-failure",
  ])("renders without crashing for %s", (serverState) => {
    givenHook({ serverState });
    expect(() => render(<TodoFlows />)).not.toThrow();
  });
});
