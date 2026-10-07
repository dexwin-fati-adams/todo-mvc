import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError, UpdateTodoRequest } from "@/api/todos/todo.api";
import { useTodos, type TodoServerState } from "@/modules/todos/hooks/useTodos";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

vi.mock("@/modules/todos/hooks/useTodos");
vi.mock("@/modules/todos/hooks/useToggleTodo");

type HookResult = ReturnType<typeof useTodos>;
type ToggleOutcome = Result<Todo, ClientError>;

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const doneTodo: Todo = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Walk the dog",
  completed: true,
  createdAt: "2026-09-29T11:00:00.000Z",
};

const toggle = vi.fn<(id: string, body: UpdateTodoRequest) => Promise<ToggleOutcome>>();

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

//Makes the next toggle() call wait until release() is called, so a test can look at the pending state.
function holdNextToggle() {
  let release!: (outcome: ToggleOutcome) => void;
  toggle.mockReturnValueOnce(
    new Promise<ToggleOutcome>((resolve) => {
      release = resolve;
    }),
  );
  return (outcome: ToggleOutcome) => release(outcome);
}

beforeEach(() => {
  vi.mocked(useTodos).mockReset();
  toggle.mockReset();
  toggle.mockResolvedValue(ok(todo));
  vi.mocked(useToggleTodo).mockReturnValue({ toggle });
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

describe("TodoFlows completion checkbox", () => {
  it("sends { completed: true } when an active row is clicked", async () => {
    givenHook({ todos: [todo] });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(todo.id, { completed: true });
  });

  it("sends { completed: false } when a completed row is clicked", async () => {
    givenHook({ todos: [doneTodo] });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Walk the dog" }));

    expect(toggle).toHaveBeenCalledWith(doneTodo.id, { completed: false });
  });

  it("sends no second request for a pending row, by click or by Space", async () => {
    givenHook({ todos: [todo] });
    holdNextToggle();
    render(<TodoFlows />);
    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });

    await userEvent.click(checkbox);
    await userEvent.click(checkbox);
    await userEvent.keyboard(" ");

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("shows Updating… on the pending row and leaves other rows usable", async () => {
    givenHook({ todos: [todo, doneTodo] });
    holdNextToggle();
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    const [first] = screen.getAllByRole("listitem");
    expect(within(first!).getByRole("status")).toHaveTextContent("Updating…");
    expect(screen.getByRole("checkbox", { name: "Buy milk" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Walk the dog" }));

    expect(toggle).toHaveBeenCalledTimes(2);
    expect(toggle).toHaveBeenLastCalledWith(doneTodo.id, { completed: false });
  });

  it("clears the pending message after a success and shows no error", async () => {
    givenHook({ todos: [todo] });
    const release = holdNextToggle();
    render(<TodoFlows />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    release(ok({ ...todo, completed: true }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Buy milk" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("leaves the checkbox in its old state and shows a safe message when the update fails", async () => {
    givenHook({ todos: [todo] });
    toggle.mockResolvedValue(err({ type: "API_ERROR", status: 503, message: "Down" }));
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not update this todo/i);
    expect(screen.getByRole("checkbox", { name: "Buy milk" })).not.toBeChecked();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the stale-data message when the todo no longer exists (404)", async () => {
    givenHook({ todos: [todo] });
    toggle.mockResolvedValue(err({ type: "API_ERROR", status: 404, message: "Todo not found" }));
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
  });

  it.each<{ name: string; error: ClientError }>([
    { name: "API", error: { type: "API_ERROR", status: 503, message: "secret-internal-detail" } },
    { name: "network", error: { type: "NETWORK_ERROR", message: "secret-internal-detail" } },
    { name: "parse", error: { type: "PARSE_ERROR", message: "secret-internal-detail" } },
  ])("never shows raw $name error details", async ({ error }) => {
    givenHook({ todos: [todo] });
    toggle.mockResolvedValue(err(error));
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
  });

  it("shows the message on the failed row only", async () => {
    givenHook({ todos: [todo, doneTodo] });
    toggle.mockResolvedValue(err({ type: "NETWORK_ERROR", message: "Offline" }));
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    await screen.findByRole("alert");
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByRole("alert")).toBeInTheDocument();
    expect(within(second!).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the message when the user tries again", async () => {
    givenHook({ todos: [todo] });
    toggle.mockResolvedValueOnce(err({ type: "NETWORK_ERROR", message: "Offline" }));
    render(<TodoFlows />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));
    await screen.findByRole("alert");
    holdNextToggle();

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Updating…");
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("keeps focus on the checkbox after a success", async () => {
    givenHook({ todos: [todo] });
    const release = holdNextToggle();
    render(<TodoFlows />);
    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });
    await userEvent.click(checkbox);
    expect(checkbox).toHaveFocus();

    release(ok({ ...todo, completed: true }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Buy milk" })).toBe(checkbox);
    expect(checkbox).toHaveFocus();
  });

  it("keeps focus on the checkbox after a failure", async () => {
    givenHook({ todos: [todo] });
    toggle.mockResolvedValue(err({ type: "NETWORK_ERROR", message: "Offline" }));
    render(<TodoFlows />);
    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });

    await userEvent.click(checkbox);

    await screen.findByRole("alert");
    expect(screen.getByRole("checkbox", { name: "Buy milk" })).toBe(checkbox);
    expect(checkbox).toHaveFocus();
  });

  it("allows a new change on the row once the first one has finished", async () => {
    givenHook({ todos: [todo] });
    render(<TodoFlows />);
    const checkbox = screen.getByRole("checkbox", { name: "Buy milk" });

    await userEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toHaveAttribute("aria-disabled", "true"));
    await userEvent.click(checkbox);

    expect(toggle).toHaveBeenCalledTimes(2);
  });
});
