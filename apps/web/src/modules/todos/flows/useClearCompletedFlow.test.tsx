import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { DeleteCompletedResponse } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import { ClearCompleted } from "@/modules/todos/components/ClearCompleted";
import { useClearCompletedFlow } from "@/modules/todos/flows/useClearCompletedFlow";
import type { ToggleAllCounts } from "@/modules/todos/flows/toggleAll";
import { useClearCompleted } from "@/modules/todos/hooks/useClearCompleted";

vi.mock("@/modules/todos/hooks/useClearCompleted");

type ClearResult = Result<DeleteCompletedResponse, ClientError>;

const someCompleted: ToggleAllCounts = { activeCount: 4, completedCount: 3 };
const noneCompleted: ToggleAllCounts = { activeCount: 5, completedCount: 0 };
const noTodos: ToggleAllCounts = { activeCount: 0, completedCount: 0 };

const unavailable: ClientError = { type: "API_ERROR", status: 503, message: "Down" };

const clear = vi.fn<() => Promise<ClearResult>>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

//A small page that uses the flow and the real ClearCompleted, so focus and clicks behave like in the app.
function Host({
  counts,
  listIsSettled = true,
  listKey = "all||1|20",
}: {
  counts: ToggleAllCounts | null;
  listIsSettled?: boolean;
  listKey?: string;
}) {
  const flow = useClearCompletedFlow({ counts, listIsSettled, listKey });
  return <ClearCompleted {...flow} />;
}

beforeEach(() => {
  clear.mockResolvedValue(ok({ deletedCount: 3 }));
  vi.mocked(useClearCompleted).mockReturnValue({
    clear,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useClearCompletedFlow", () => {
  // 32
  it("shows an enabled button labelled for the whole collection when something is completed", () => {
    render(<Host counts={someCompleted} />);

    const button = screen.getByRole("button", { name: "Clear all 3 completed todos" });
    expect(button).toBeEnabled();
    expect(
      screen.getByText(
        "This deletes every completed todo, including other pages and filters. It cannot be undone.",
      ),
    ).toBeInTheDocument();
  });

  // 33
  it("shows nothing when no todo is completed and there is no message", () => {
    const { container } = render(<Host counts={noneCompleted} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when there are no todos at all", () => {
    render(<Host counts={noTodos} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // 34
  it("shows nothing when there are no counts yet", () => {
    const { container } = render(<Host counts={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  // 35
  it("calls clear once, with no arguments, when the button is clicked", async () => {
    render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));

    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith();
  });

  // 36
  it("sends no scope, even when the screen shows a filtered, searched, later page", async () => {
    render(<Host counts={someCompleted} listKey="completed|milk|3|10" />);

    await userEvent.click(screen.getByRole("button"));

    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear.mock.calls[0]).toHaveLength(0);
  });

  // 37
  it("is disabled, busy and says it is clearing while the request runs", async () => {
    const pending = deferred<ClearResult>();
    clear.mockReturnValue(pending.promise);
    const { container } = render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Clearing completed todos…");

    await act(async () => {
      pending.resolve(ok({ deletedCount: 3 }));
    });
  });

  // 38
  it("sends no second request when it is clicked or pressed again while pending", async () => {
    const pending = deferred<ClearResult>();
    clear.mockReturnValue(pending.promise);
    render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("button"));
    await userEvent.keyboard("{Enter}");

    expect(clear).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(ok({ deletedCount: 3 }));
    });
  });

  it("refuses a second call even if it arrives before the next render (the ref guard)", async () => {
    const pending = deferred<ClearResult>();
    clear.mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useClearCompletedFlow({ counts: someCompleted, listIsSettled: true, listKey: "k" }),
    );

    act(() => {
      result.current.onClear();
      result.current.onClear();
    });

    expect(clear).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(ok({ deletedCount: 3 }));
    });
  });

  // 39
  it("shows how many todos were deleted, and the button can be used again", async () => {
    const { rerender } = render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("Deleted 3 completed todos.")).toBeInTheDocument();
    // The delete worked but no fresh counts have arrived, so the old "Clear all 3" must not be offered again.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    // Once the refresh brings fresh counts, the button is back with the new number.
    rerender(<Host counts={{ activeCount: 0, completedCount: 2 }} />);

    expect(screen.getByRole("button", { name: "Clear all 2 completed todos" })).toBeEnabled();
  });

  it("uses singular wording when one todo was deleted", async () => {
    clear.mockResolvedValue(ok({ deletedCount: 1 }));
    render(<Host counts={{ activeCount: 2, completedCount: 1 }} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("Deleted 1 completed todo.")).toBeInTheDocument();
  });

  // 40
  it("says there was nothing to delete when the server deleted zero todos", async () => {
    clear.mockResolvedValue(ok({ deletedCount: 0 }));
    render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("There were no completed todos to delete.")).toBeInTheDocument();
  });

  // 41
  it("shows the safe failure message, enables the button, and lets the user try again", async () => {
    clear.mockResolvedValueOnce(err(unavailable));
    render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));

    expect(
      await screen.findByText("Could not clear completed todos. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();

    await userEvent.click(screen.getByRole("button"));

    expect(clear).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Deleted 3 completed todos.")).toBeInTheDocument();
  });

  // 42
  it("never shows the status code or the server text", async () => {
    clear.mockResolvedValueOnce(err(unavailable));
    const { container } = render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));
    await screen.findByRole("alert");

    expect(container).not.toHaveTextContent("503");
    expect(container).not.toHaveTextContent("Down");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not clear completed todos. Please try again.",
    );
  });

  it("shows the same safe message for a network error and a parse error", async () => {
    clear.mockResolvedValueOnce(err({ type: "NETWORK_ERROR", message: "Offline" }));
    const { unmount } = render(<Host counts={someCompleted} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not clear completed todos. Please try again.",
    );
    unmount();

    clear.mockResolvedValueOnce(err({ type: "PARSE_ERROR", message: "Bad body" }));
    render(<Host counts={someCompleted} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not clear completed todos. Please try again.",
    );
  });

  // 43
  it("does not stay disabled when clear throws", async () => {
    clear.mockRejectedValueOnce(new Error("boom"));
    render(<Host counts={someCompleted} />);

    await userEvent.click(screen.getByRole("button"));

    expect(
      await screen.findByText("Could not clear completed todos. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeEnabled();
  });

  // 44
  it("moves focus to the status message after a success, when the button had focus", async () => {
    render(<Host counts={someCompleted} />);

    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await screen.findByText("Deleted 3 completed todos.");

    // The counts have not been refreshed in this test, so the button is still on the page. Focus goes to the message anyway.
    expect(screen.getByRole("status")).toHaveFocus();
  });

  // 45
  it("puts focus back on the button after a failure, when the button had focus", async () => {
    clear.mockResolvedValueOnce(err(unavailable));
    render(<Host counts={someCompleted} />);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("alert");

    expect(screen.getByRole("button")).toHaveFocus();
  });

  // 46
  it("does not steal focus when the user moved to something else while it was pending", async () => {
    const pending = deferred<ClearResult>();
    clear.mockReturnValue(pending.promise);
    render(
      <>
        <Host counts={someCompleted} />
        <button type="button">Elsewhere</button>
      </>,
    );

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await act(async () => {
      pending.resolve(ok({ deletedCount: 3 }));
    });
    await screen.findByText("Deleted 3 completed todos.");

    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });

  // 47
  it("does not move focus when the button did not have focus (a plain click event)", async () => {
    render(<Host counts={someCompleted} />);

    // fireEvent.click does not focus the button, like a mouse click in some browsers.
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("Deleted 3 completed todos.");

    expect(screen.getByRole("status")).not.toHaveFocus();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // 48
  it("keeps the last known count, disabled, while a new list loads", () => {
    const { rerender } = render(<Host counts={someCompleted} />);

    rerender(<Host counts={null} listIsSettled={false} />);

    const button = screen.getByRole("button", { name: "Clear all 3 completed todos" });
    expect(button).toBeDisabled();
  });

  it("uses the new counts as soon as they arrive", () => {
    const { rerender } = render(<Host counts={someCompleted} />);
    rerender(<Host counts={null} />);

    rerender(<Host counts={{ activeCount: 1, completedCount: 8 }} />);

    expect(screen.getByRole("button", { name: "Clear all 8 completed todos" })).toBeEnabled();
  });

  it("sends nothing from unknown counts, or when nothing is completed", () => {
    const unknown = renderHook(() =>
      useClearCompletedFlow({ counts: null, listIsSettled: true, listKey: "k" }),
    );
    const none = renderHook(() =>
      useClearCompletedFlow({ counts: noneCompleted, listIsSettled: true, listKey: "k" }),
    );

    act(() => {
      unknown.result.current.onClear();
      none.result.current.onClear();
    });

    expect(clear).not.toHaveBeenCalled();
  });

  // 49
  it("keeps the success message on the page, with no button, once the counts say nothing is completed", async () => {
    const { rerender } = render(<Host counts={someCompleted} listKey="all||1|20" />);
    await userEvent.click(screen.getByRole("button"));
    await screen.findByText("Deleted 3 completed todos.");

    rerender(<Host counts={{ activeCount: 4, completedCount: 0 }} listKey="all||1|20" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted 3 completed todos.");

    rerender(<Host counts={{ activeCount: 4, completedCount: 0 }} listKey="all||2|20" />);

    expect(screen.queryByText("Deleted 3 completed todos.")).not.toBeInTheDocument();
  });

  // 50
  it("clears the failure message when the list key changes", async () => {
    clear.mockResolvedValueOnce(err(unavailable));
    const { rerender } = render(<Host counts={someCompleted} listKey="all||1|20" />);
    await userEvent.click(screen.getByRole("button"));
    await screen.findByRole("alert");

    rerender(<Host counts={someCompleted} listKey="active||1|20" />);

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("keeps the clearing message when the list key changes during a request", async () => {
    const pending = deferred<ClearResult>();
    clear.mockReturnValue(pending.promise);
    const { rerender } = render(<Host counts={someCompleted} listKey="all||1|20" />);
    await userEvent.click(screen.getByRole("button"));

    rerender(<Host counts={someCompleted} listKey="all||2|20" />);

    expect(screen.getByRole("status")).toHaveTextContent("Clearing completed todos…");

    await act(async () => {
      pending.resolve(ok({ deletedCount: 3 }));
    });
  });
});
