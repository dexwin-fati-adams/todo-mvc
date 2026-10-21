import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { Status, Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError, UpdateTodoRequest } from "@/api/todos/todo.api";
import { useTodos, type TodoServerState } from "@/modules/todos/hooks/useTodos";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";
import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

vi.mock("@/modules/todos/hooks/useTodos");
vi.mock("@/modules/todos/hooks/useToggleTodo");
vi.mock("@/modules/todos/hooks/useDeleteTodo");

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

function hookResult(overrides: Partial<HookResult>): HookResult {
  return {
    serverState: "ready",
    error: null,
    refetch: vi.fn(),
    todos: [],
    counts: null,
    ...overrides,
  };
}

function givenHook(overrides: Partial<HookResult>) {
  const result = hookResult(overrides);
  vi.mocked(useTodos).mockReturnValue(result);
  return result;
}

//Gives each status its own hook result, the way the real hook has one result per status.
function givenHookByStatus(byStatus: Partial<Record<Status, HookResult>>) {
  vi.mocked(useTodos).mockImplementation(
    (query) => byStatus[query?.status ?? "all"] ?? hookResult({}),
  );
}

function givenHookBySearch(results: { searched: HookResult; unsearched: HookResult }) {
  vi.mocked(useTodos).mockImplementation((query) =>
    query?.search ? results.searched : results.unsearched,
  );
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

const searchBox = () => screen.getByRole("searchbox", { name: "Search todos" });

async function searchFor(text: string) {
  await userEvent.type(searchBox(), `${text}{Enter}`);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.mocked(useTodos).mockReset();
  toggle.mockReset();
  toggle.mockResolvedValue(ok(todo));
  vi.mocked(useToggleTodo).mockReturnValue({ toggle });
  vi.mocked(useDeleteTodo).mockReturnValue({
    remove: vi.fn().mockResolvedValue(ok(undefined)),
  });
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
    expect(useTodos).toHaveBeenCalledWith({ status: "all", search: null, page: 1 });
  });

  it("passes the status from the page address to the hook", () => {
    window.history.replaceState(null, "", "/?status=active");
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith({ status: "active", search: null, page: 1 });
  });

  it("asks the hook for all todos when the address has an unknown status", () => {
    window.history.replaceState(null, "", "/?status=bogus");
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith({ status: "all", search: null, page: 1 });
    expect(useTodos).not.toHaveBeenCalledWith(expect.objectContaining({ status: "bogus" }));
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

describe("TodoFlows status filter", () => {
  it.each<TodoServerState>([
    "initial-loading",
    "initial-failure",
    "empty",
    "ready",
    "refreshing",
    "refresh-failure",
  ])("keeps the filter links on screen for %s", (serverState) => {
    givenHook({ serverState, error: { type: "NETWORK_ERROR", message: "Offline" } });
    render(<TodoFlows />);

    const nav = screen.getByRole("navigation", { name: "Filter todos" });
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });

  it("starts on All and marks it as the current filter", () => {
    givenHook({});
    render(<TodoFlows />);

    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the counts from the hook on the links", () => {
    givenHook({ todos: [todo, doneTodo], counts: { active: 1, completed: 1 } });
    render(<TodoFlows />);

    expect(screen.getByRole("link", { name: /^All\s*\(2\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Active\s*\(1\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Completed\s*\(1\)$/ })).toBeInTheDocument();
  });

  it("asks the hook for the status of the link the user clicks", async () => {
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenLastCalledWith({ status: "all", search: null, page: 1 });

    await userEvent.click(screen.getByRole("link", { name: "Active" }));
    expect(useTodos).toHaveBeenLastCalledWith({ status: "active", search: null, page: 1 });
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "Completed" }));
    expect(useTodos).toHaveBeenLastCalledWith({ status: "completed", search: null, page: 1 });

    await userEvent.click(screen.getByRole("link", { name: "All" }));
    expect(useTodos).toHaveBeenLastCalledWith({ status: "all", search: null, page: 1 });
  });

  it("shows no rows from the previous filter while the new filter is loading", async () => {
    givenHookByStatus({
      all: hookResult({ todos: [todo, doneTodo] }),
      completed: hookResult({ serverState: "initial-loading", todos: [] }),
    });
    render(<TodoFlows />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Completed" }));

    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
    expect(screen.queryByText("Walk the dog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/loading todos/i);
  });

  it("shows the safe error with Retry for a failed first load, keeps the new filter selected, and lets the user switch", async () => {
    givenHookByStatus({
      all: hookResult({ todos: [todo] }),
      completed: hookResult({
        serverState: "initial-failure",
        error: { type: "NETWORK_ERROR", message: "secret-internal-detail" },
      }),
    });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("link", { name: "Completed" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "All" }));

    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retries the selected filter and no other", async () => {
    const allResult = hookResult({ todos: [todo] });
    const completedResult = hookResult({
      serverState: "initial-failure",
      error: { type: "NETWORK_ERROR", message: "Offline" },
    });
    givenHookByStatus({ all: allResult, completed: completedResult });
    render(<TodoFlows />);
    await userEvent.click(screen.getByRole("link", { name: "Completed" }));

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(completedResult.refetch).toHaveBeenCalledTimes(1);
    expect(allResult.refetch).not.toHaveBeenCalled();
  });
});

describe("TodoFlows search", () => {
  it.each<TodoServerState>([
    "initial-loading",
    "initial-failure",
    "empty",
    "ready",
    "refreshing",
    "refresh-failure",
  ])("keeps the search box and the filter links on screen for %s", (serverState) => {
    window.history.replaceState(null, "", "/?search=milk");
    givenHook({ serverState, error: { type: "NETWORK_ERROR", message: "Offline" } });
    render(<TodoFlows />);

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(searchBox()).toHaveValue("milk");
    const nav = screen.getByRole("navigation", { name: "Filter todos" });
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });

  it("asks the hook for the committed search and the current status", async () => {
    givenHook({});
    render(<TodoFlows />);

    await searchFor("milk");

    expect(useTodos).toHaveBeenLastCalledWith({ status: "all", search: "milk", page: 1 });
    expect(window.location.search).toBe("?search=milk");
  });

  it("keeps the search in the hook call and in the link addresses when a status is chosen", async () => {
    window.history.replaceState(null, "", "/?search=milk");
    givenHook({});
    render(<TodoFlows />);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/?search=milk");
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute(
      "href",
      "/?status=active&search=milk",
    );
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute(
      "href",
      "/?status=completed&search=milk",
    );

    await userEvent.click(screen.getByRole("link", { name: "Active" }));

    expect(useTodos).toHaveBeenLastCalledWith({ status: "active", search: "milk", page: 1 });
    expect(searchBox()).toHaveValue("milk");
    expect(window.location.search).toBe("?status=active&search=milk");
  });

  it("keeps the selected status when a search is committed", async () => {
    window.history.replaceState(null, "", "/?status=active");
    givenHook({});
    render(<TodoFlows />);

    await searchFor("milk");

    expect(useTodos).toHaveBeenLastCalledWith({ status: "active", search: "milk", page: 1 });
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute("aria-current", "page");
    expect(window.location.search).toBe("?status=active&search=milk");
  });

  it("drops the page when a new search is committed", async () => {
    window.history.replaceState(null, "", "/?page=3");
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith({ status: "all", search: null, page: 3 });

    await searchFor("milk");

    expect(useTodos).toHaveBeenLastCalledWith({ status: "all", search: "milk", page: 1 });
    expect(window.location.search).toBe("?search=milk");
  });

  it("never passes an invalid search to the hook, and shows the message", async () => {
    givenHook({});
    render(<TodoFlows />);

    await searchFor("   ");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a search term, or clear the box to see all todos.",
    );
    expect(useTodos).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.any(String) }),
    );
    expect(window.location.search).toBe("");
  });

  it("shows the safe error with Retry for a failed first load of a search, keeps the typed text, and Clear still works", async () => {
    window.history.replaceState(null, "", "/?search=milk");
    givenHookBySearch({
      searched: hookResult({
        serverState: "initial-failure",
        error: { type: "NETWORK_ERROR", message: "secret-internal-detail" },
      }),
      unsearched: hookResult({ todos: [todo, doneTodo] }),
    });
    render(<TodoFlows />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
    expect(searchBox()).toHaveValue("milk");

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(useTodos).toHaveBeenLastCalledWith({ status: "all", search: null, page: 1 });
    expect(searchBox()).toHaveValue("");
    expect(searchBox()).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("retries the current search and no other query", async () => {
    window.history.replaceState(null, "", "/?search=milk");
    const searched = hookResult({
      serverState: "initial-failure",
      error: { type: "NETWORK_ERROR", message: "Offline" },
    });
    const unsearched = hookResult({ todos: [todo] });
    givenHookBySearch({ searched, unsearched });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(searched.refetch).toHaveBeenCalledTimes(1);
    expect(unsearched.refetch).not.toHaveBeenCalled();
  });

  it("shows no counts on the status links while a search is committed, and shows them again after Clear", async () => {
    window.history.replaceState(null, "", "/?search=milk");
    const withCounts = hookResult({ todos: [todo], counts: { active: 1, completed: 1 } });
    givenHookBySearch({ searched: withCounts, unsearched: withCounts });
    render(<TodoFlows />);

    expect(screen.getByRole("link", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completed" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByRole("link", { name: /^All\s*\(2\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Active\s*\(1\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Completed\s*\(1\)$/ })).toBeInTheDocument();
  });

  it.each<{ status: Status; url: string; message: string }>([
    { status: "all", url: "/?search=milk", message: "No todos match “milk”." },
    {
      status: "active",
      url: "/?status=active&search=milk",
      message: "No active todos match “milk”.",
    },
    {
      status: "completed",
      url: "/?status=completed&search=milk",
      message: "No completed todos match “milk”.",
    },
  ])("names the search in the empty message for $status", ({ url, message }) => {
    window.history.replaceState(null, "", url);
    givenHook({ serverState: "empty" });
    render(<TodoFlows />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("No todos yet.")).not.toBeInTheDocument();
  });

  it("renders the search text in the empty message as text, never as HTML", () => {
    window.history.replaceState(null, "", "/?search=%3Cb%3Ex%3C%2Fb%3E");
    givenHook({ serverState: "empty" });
    const { container } = render(<TodoFlows />);

    expect(screen.getByText("No todos match “<b>x</b>”.")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });

  it("shows the empty message of the search and moves focus to it after the last row is deleted", async () => {
    window.history.replaceState(null, "", "/?search=milk");
    let current = hookResult({ todos: [todo] });
    vi.mocked(useTodos).mockImplementation(() => current);
    vi.mocked(useDeleteTodo).mockReturnValue({
      remove: vi.fn().mockImplementation(async () => {
        current = hookResult({ serverState: "empty", todos: [] });
        return ok(undefined);
      }),
    });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("button", { name: "Delete “Buy milk”" }));

    const empty = await screen.findByText("No todos match “milk”.");
    await waitFor(() => expect(empty).toHaveFocus());
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
