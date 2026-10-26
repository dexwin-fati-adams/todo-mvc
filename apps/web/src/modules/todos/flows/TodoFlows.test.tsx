import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { Status, Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError, UpdateTodoRequest } from "@/api/todos/todo.api";
import { useTodos, type TodoServerState } from "@/modules/todos/hooks/useTodos";
import { type PageSize } from "@/modules/todos/flows/pageSize";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";
import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

vi.mock("@/modules/todos/hooks/useTodos");
vi.mock("@/modules/todos/hooks/useToggleTodo");
vi.mock("@/modules/todos/hooks/useDeleteTodo");

type HookResult = ReturnType<typeof useTodos>;
type PaginationInfo = NonNullable<HookResult["pagination"]>;
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
    pagination: null,
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

//Gives each page its own hook result, the way the real hook has one result per page.
function givenHookByPage(byPage: (page: number, pageSize: PageSize) => HookResult) {
  vi.mocked(useTodos).mockImplementation((query) =>
    byPage(query?.page ?? 1, query?.pageSize ?? 20),
  );
}

function pageInfo(
  page: number,
  totalPages: number,
  options: { totalItems?: number; pageSize?: PageSize } = {},
): PaginationInfo {
  return {
    page,
    pageSize: options.pageSize ?? 20,
    totalItems: options.totalItems ?? totalPages * 20,
    totalPages,
  };
}

//A list with a fixed number of pages. Every page has a row, and the metadata follows the page that was asked for.
function givenPages(totalPages: number) {
  givenHookByPage((page, pageSize) =>
    hookResult({ todos: [todo], pagination: pageInfo(page, totalPages, { pageSize }) }),
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
const previousButton = () => screen.getByRole("button", { name: "Previous page" });
const nextButton = () => screen.getByRole("button", { name: "Next page" });
const sizeSelect = () => screen.getByRole("combobox", { name: "Todos per page" });

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
    expect(useTodos).toHaveBeenCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
  });

  it("passes the status from the page address to the hook", () => {
    window.history.replaceState(null, "", "/?status=active");
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith({
      status: "active",
      search: null,
      page: 1,
      pageSize: 20,
    });
  });

  it("asks the hook for all todos when the address has an unknown status", () => {
    window.history.replaceState(null, "", "/?status=bogus");
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
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

describe("TodoFlows empty messages", () => {
  it.each<{ name: string; url: string; message: string }>([
    { name: "all", url: "/", message: "No todos yet." },
    { name: "active", url: "/?status=active", message: "No todos yet." },
    { name: "completed", url: "/?status=completed", message: "No completed todos." },
  ])("shows the right empty message for $name with no search", ({ url, message }) => {
    window.history.replaceState(null, "", url);
    givenHook({ serverState: "empty" });
    render(<TodoFlows />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("does not show the completed message on the other filters", () => {
    window.history.replaceState(null, "", "/?status=active");
    givenHook({ serverState: "empty" });
    render(<TodoFlows />);

    expect(screen.queryByText("No completed todos.")).not.toBeInTheDocument();
  });

  it("shows the completed message when a ready list has no rows", () => {
    window.history.replaceState(null, "", "/?status=completed");
    givenHook({ serverState: "ready", todos: [] });
    render(<TodoFlows />);

    expect(screen.getByText("No completed todos.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("switches the empty message when the user changes the filter", async () => {
    givenHookByStatus({
      all: hookResult({ serverState: "empty" }),
      completed: hookResult({ serverState: "empty" }),
    });
    render(<TodoFlows />);
    expect(screen.getByText("No todos yet.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Completed" }));

    expect(screen.getByText("No completed todos.")).toBeInTheDocument();
    expect(screen.queryByText("No todos yet.")).not.toBeInTheDocument();
  });

  it("does not show an empty message while the list has rows", () => {
    window.history.replaceState(null, "", "/?status=completed");
    givenHook({ todos: [doneTodo] });
    render(<TodoFlows />);

    expect(screen.queryByText("No completed todos.")).not.toBeInTheDocument();
    expect(screen.getByText("Walk the dog")).toBeInTheDocument();
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
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });

    await userEvent.click(screen.getByRole("link", { name: "Active" }));
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "active",
      search: null,
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "Completed" }));
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "completed",
      search: null,
      page: 1,
      pageSize: 20,
    });

    await userEvent.click(screen.getByRole("link", { name: "All" }));
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
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

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: "milk",
      page: 1,
      pageSize: 20,
    });
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

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "active",
      search: "milk",
      page: 1,
      pageSize: 20,
    });
    expect(searchBox()).toHaveValue("milk");
    expect(window.location.search).toBe("?status=active&search=milk");
  });

  it("keeps the selected status when a search is committed", async () => {
    window.history.replaceState(null, "", "/?status=active");
    givenHook({});
    render(<TodoFlows />);

    await searchFor("milk");

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "active",
      search: "milk",
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute("aria-current", "page");
    expect(window.location.search).toBe("?status=active&search=milk");
  });

  it("drops the page when a new search is committed", async () => {
    window.history.replaceState(null, "", "/?page=3");
    givenHook({});
    render(<TodoFlows />);
    expect(useTodos).toHaveBeenCalledWith({
      status: "all",
      search: null,
      page: 3,
      pageSize: 20,
    });

    await searchFor("milk");

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: "milk",
      page: 1,
      pageSize: 20,
    });
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

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
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

  it("names the search in the empty message when a ready list has no rows", () => {
    window.history.replaceState(null, "", "/?status=active&search=milk");
    givenHook({ serverState: "ready", todos: [] });
    render(<TodoFlows />);

    expect(screen.getByText("No active todos match “milk”.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
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

describe("TodoFlows pagination", () => {
  //Test 55
  it.each<TodoServerState>([
    "initial-loading",
    "initial-failure",
    "empty",
    "ready",
    "refreshing",
    "refresh-failure",
  ])("keeps the page bar on screen for %s", (serverState) => {
    givenHook({ serverState, error: { type: "NETWORK_ERROR", message: "Offline" } });
    render(<TodoFlows />);

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(within(nav).getByRole("combobox", { name: "Todos per page" })).toBeInTheDocument();
  });

  it("shows Page X of Y from the response on screen", () => {
    window.history.replaceState(null, "", "/?page=2");
    givenPages(5);
    render(<TodoFlows />);

    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  //Test 56
  it("asks the hook for the next page with the same status, search, and page size, and the URL shows it", async () => {
    window.history.replaceState(null, "", "/?status=active&search=milk&pageSize=10");
    givenPages(5);
    render(<TodoFlows />);

    await userEvent.click(nextButton());

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "active",
      search: "milk",
      page: 2,
      pageSize: 10,
    });
    expect(window.location.search).toBe("?status=active&search=milk&page=2&pageSize=10");
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  //Test 57
  it("goes back one page with Previous, and page 1 removes page from the URL", async () => {
    window.history.replaceState(null, "", "/?page=3");
    givenPages(5);
    render(<TodoFlows />);

    await userEvent.click(previousButton());
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 2,
      pageSize: 20,
    });
    expect(window.location.search).toBe("?page=2");

    await userEvent.click(previousButton());
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
    expect(window.location.search).toBe("");
    expect(previousButton()).toBeDisabled();
  });

  //Test 58
  it("goes back to page 1 and uses the new size when the page size changes from page 3", async () => {
    window.history.replaceState(null, "", "/?page=3");
    givenPages(5);
    render(<TodoFlows />);

    await userEvent.selectOptions(sizeSelect(), "10");

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 10,
    });
    expect(window.location.search).toBe("?pageSize=10");
    expect(sizeSelect()).toHaveValue("10");
  });

  //Test 59
  it("drops the page and keeps the page size when a new search is committed", async () => {
    window.history.replaceState(null, "", "/?page=3&pageSize=10");
    givenPages(5);
    render(<TodoFlows />);

    await searchFor("milk");

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: "milk",
      page: 1,
      pageSize: 10,
    });
    expect(window.location.search).toBe("?search=milk&pageSize=10");
  });

  it("drops the page and keeps the page size when the search is cleared", async () => {
    window.history.replaceState(null, "", "/?search=milk&page=3&pageSize=10");
    givenPages(5);
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 10,
    });
    expect(window.location.search).toBe("?pageSize=10");
  });

  //Test 60
  it("drops the page and keeps the page size when a status is chosen, and the status links keep pageSize", async () => {
    window.history.replaceState(null, "", "/?page=3&pageSize=10");
    givenPages(5);
    render(<TodoFlows />);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/?pageSize=10");
    expect(screen.getByRole("link", { name: "Active" })).toHaveAttribute(
      "href",
      "/?status=active&pageSize=10",
    );

    await userEvent.click(screen.getByRole("link", { name: "Active" }));

    expect(useTodos).toHaveBeenLastCalledWith({
      status: "active",
      search: null,
      page: 1,
      pageSize: 10,
    });
    expect(window.location.search).toBe("?status=active&pageSize=10");
  });

  //Test 61
  it("recovers from an empty page past the end with replaceState, and says which page is shown", async () => {
    window.history.replaceState(null, "", "/?page=9");
    const historyLength = window.history.length;
    givenHookByPage((page) =>
      page === 9
        ? hookResult({ serverState: "empty", pagination: pageInfo(9, 3, { totalItems: 45 }) })
        : hookResult({ todos: [todo], pagination: pageInfo(page, 3, { totalItems: 45 }) }),
    );

    render(<TodoFlows />);

    const notice = await screen.findByText("Page 9 does not exist. Showing page 3.");
    expect(notice).toHaveAttribute("role", "status");
    expect(window.location.search).toBe("?page=3");
    expect(window.history.length).toBe(historyLength);
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 3,
      pageSize: 20,
    });
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
  });

  //Test 62
  it("resets to page 1, shows the normal empty message, and shows the recovery message when there are no todos", async () => {
    window.history.replaceState(null, "", "/?page=4");
    givenHookByPage((page) =>
      hookResult({
        serverState: "empty",
        pagination: pageInfo(page, 0, { totalItems: 0 }),
      }),
    );

    render(<TodoFlows />);

    expect(await screen.findByText("Page 4 does not exist. Showing page 1.")).toBeInTheDocument();
    expect(screen.getByText(/no todos yet/i)).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(previousButton()).toBeDisabled();
    expect(nextButton()).toBeDisabled();
  });

  //Test 63
  it("runs the recovery once, with no loop", async () => {
    window.history.replaceState(null, "", "/?page=9");
    const replaceState = vi.spyOn(window.history, "replaceState");
    givenHookByPage((page) =>
      page === 9
        ? hookResult({ serverState: "empty", pagination: pageInfo(9, 3, { totalItems: 45 }) })
        : hookResult({ todos: [todo], pagination: pageInfo(page, 3, { totalItems: 45 }) }),
    );

    render(<TodoFlows />);

    await screen.findByText("Page 9 does not exist. Showing page 3.");
    const recoveries = replaceState.mock.calls.filter(([, , url]) => String(url) === "/?page=3");
    expect(recoveries).toHaveLength(1);
    const pages = vi.mocked(useTodos).mock.calls.map(([query]) => query?.page);
    expect(pages.at(-1)).toBe(3);
    expect(pages.indexOf(3)).toBeGreaterThan(pages.lastIndexOf(9));
    replaceState.mockRestore();
  });

  it("shows an empty page inside the range as it is, with no recovery", () => {
    window.history.replaceState(null, "", "/?page=2");
    givenHookByPage((page) =>
      hookResult({ serverState: "empty", pagination: pageInfo(page, 3, { totalItems: 45 }) }),
    );

    render(<TodoFlows />);

    expect(window.location.search).toBe("?page=2");
    expect(screen.queryByText(/does not exist/i)).not.toBeInTheDocument();
  });

  //Test 64
  it.each<{ name: string; act: () => Promise<void> }>([
    { name: "the page", act: () => userEvent.click(previousButton()) },
    { name: "the page size", act: () => userEvent.selectOptions(sizeSelect(), "10") },
    {
      name: "the status",
      act: () => userEvent.click(screen.getByRole("link", { name: "Active" })),
    },
    { name: "the search", act: () => searchFor("milk") },
  ])("removes the recovery message when the user changes $name", async ({ act }) => {
    window.history.replaceState(null, "", "/?page=9");
    givenHookByPage((page) =>
      page === 9
        ? hookResult({ serverState: "empty", pagination: pageInfo(9, 3, { totalItems: 45 }) })
        : hookResult({ todos: [todo], pagination: pageInfo(page, 3, { totalItems: 45 }) }),
    );
    render(<TodoFlows />);
    await screen.findByText("Page 9 does not exist. Showing page 3.");

    await act();

    expect(screen.queryByText(/does not exist/i)).not.toBeInTheDocument();
  });

  //Test 65
  it("recovers to the last valid page after the last row of the last page is deleted, and focus is not lost", async () => {
    window.history.replaceState(null, "", "/?page=3");
    let deleted = false;
    givenHookByPage((page) => {
      if (deleted) {
        return page === 3
          ? hookResult({ serverState: "empty", pagination: pageInfo(3, 2, { totalItems: 40 }) })
          : hookResult({ todos: [doneTodo], pagination: pageInfo(page, 2, { totalItems: 40 }) });
      }
      return hookResult({ todos: [todo], pagination: pageInfo(page, 3, { totalItems: 41 }) });
    });
    vi.mocked(useDeleteTodo).mockReturnValue({
      remove: vi.fn().mockImplementation(async () => {
        deleted = true;
        return ok(undefined);
      }),
    });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("button", { name: "Delete “Buy milk”" }));

    const notice = await screen.findByText("Page 3 does not exist. Showing page 2.");
    expect(window.location.search).toBe("?page=2");
    expect(screen.getByText("Walk the dog")).toBeInTheDocument();
    await waitFor(() => expect(notice).toHaveFocus());
  });

  //Test 66
  it("recovers in the same way when toggling the last row of a page in a filtered list empties it", async () => {
    window.history.replaceState(null, "", "/?status=active&page=2");
    let toggled = false;
    givenHookByPage((page) => {
      if (toggled) {
        return page === 2
          ? hookResult({ serverState: "empty", pagination: pageInfo(2, 1, { totalItems: 20 }) })
          : hookResult({ todos: [doneTodo], pagination: pageInfo(page, 1, { totalItems: 20 }) });
      }
      return hookResult({ todos: [todo], pagination: pageInfo(page, 2, { totalItems: 21 }) });
    });
    toggle.mockImplementation(async () => {
      toggled = true;
      return ok({ ...todo, completed: true });
    });
    render(<TodoFlows />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Buy milk" }));

    expect(await screen.findByText("Page 2 does not exist. Showing page 1.")).toBeInTheDocument();
    expect(window.location.search).toBe("?status=active");
  });

  //Test 67
  it("never passes an invalid page or page size from the URL to the hook, and cleans the URL", () => {
    window.history.replaceState(null, "", "/?page=0&pageSize=7");
    givenHook({});

    render(<TodoFlows />);

    expect(useTodos).not.toHaveBeenCalledWith(expect.objectContaining({ page: 0 }));
    expect(useTodos).not.toHaveBeenCalledWith(expect.objectContaining({ pageSize: 7 }));
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
    expect(window.location.search).toBe("");
  });

  //Test 68
  it("keeps the page bar usable when a page fails to load, and Retry refetches the current page only", async () => {
    window.history.replaceState(null, "", "/?page=2");
    const failed = hookResult({
      serverState: "initial-failure",
      error: { type: "NETWORK_ERROR", message: "secret-internal-detail" },
    });
    const fine = hookResult({ todos: [todo], pagination: pageInfo(1, 3) });
    givenHookByPage((page) => (page === 2 ? failed : fine));
    render(<TodoFlows />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(previousButton()).toBeEnabled();
    expect(sizeSelect()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(failed.refetch).toHaveBeenCalledTimes(1);
    expect(fine.refetch).not.toHaveBeenCalled();

    await userEvent.click(previousButton());
    expect(useTodos).toHaveBeenLastCalledWith({
      status: "all",
      search: null,
      page: 1,
      pageSize: 20,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  //Test 69
  it("keeps Next enabled and focused while the next page loads, using the last known page count", async () => {
    givenHookByPage((page) =>
      page === 1
        ? hookResult({ todos: [todo], pagination: pageInfo(1, 3) })
        : hookResult({ serverState: "initial-loading", todos: [], pagination: null }),
    );
    render(<TodoFlows />);

    await userEvent.click(nextButton());

    expect(screen.getByRole("status")).toHaveTextContent(/loading todos/i);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(nextButton()).toBeEnabled();
    expect(nextButton()).toHaveFocus();
  });

  it("drops the last known page count when the status changes, so Next is disabled until the response arrives", async () => {
    givenHookByStatus({
      all: hookResult({ todos: [todo], pagination: pageInfo(1, 3) }),
      active: hookResult({ serverState: "initial-loading", todos: [], pagination: null }),
    });
    render(<TodoFlows />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Active" }));

    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });
});
