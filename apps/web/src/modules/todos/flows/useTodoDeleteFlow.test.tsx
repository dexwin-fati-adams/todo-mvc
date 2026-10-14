import { act, renderHook } from "@testing-library/react";
import { err, ok, type Result } from "neverthrow";
import type { Todo } from "contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todos/todo.api";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";
import { useTodoDeleteFlow } from "@/modules/todos/flows/useTodoDeleteFlow";

vi.mock("@/modules/todos/hooks/useDeleteTodo");

type Outcome = Result<undefined, ClientError>;

const DELETE_FAILED = "Could not delete this todo. Please try again.";
const ALREADY_DELETED = "That todo was already deleted. The list has been refreshed.";

const first: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};
const second: Todo = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Walk the dog",
  completed: true,
  createdAt: "2026-09-29T11:00:00.000Z",
};
const third: Todo = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Call mum",
  completed: false,
  createdAt: "2026-09-29T12:00:00.000Z",
};

const remove = vi.fn<(id: string) => Promise<Outcome>>();

//Makes the next remove() call wait until release() is called, so a test can look at the pending state.
function holdNextRemove() {
  let release!: (outcome: Outcome) => void;
  remove.mockReturnValueOnce(
    new Promise<Outcome>((resolve) => {
      release = resolve;
    }),
  );
  return (outcome: Outcome) => release(outcome);
}

function setup(todos: Todo[] = [first, second, third]) {
  const setRowMessage = vi.fn<(id: string, message: string) => void>();
  const clearRowMessage = vi.fn<(id: string) => void>();
  const utils = renderHook(
    ({ list }: { list: Todo[] }) =>
      useTodoDeleteFlow({ todos: list, setRowMessage, clearRowMessage }),
    { initialProps: { list: todos } },
  );
  return { ...utils, setRowMessage, clearRowMessage };
}

type Flow = ReturnType<typeof setup>["result"];

//Registers a real button for a todo, the way the row does, so the tests can check where focus goes.
function mountDeleteButton(result: Flow, todo: Todo) {
  const button = document.createElement("button");
  button.textContent = `Delete ${todo.title}`;
  document.body.append(button);
  result.current.setDeleteButton(todo.id)(button);
  return button;
}

function mountFocusTarget(result: Flow) {
  const target = document.createElement("div");
  target.tabIndex = -1;
  document.body.append(target);
  result.current.setFocusTarget(target);
  return target;
}

beforeEach(() => {
  remove.mockReset();
  remove.mockResolvedValue(ok(undefined));
  vi.mocked(useDeleteTodo).mockReturnValue({ remove });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useTodoDeleteFlow", () => {
  it("calls remove with the todo id", () => {
    const { result } = setup();

    act(() => result.current.onDelete(first));

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(first.id);
  });

  it("marks the row as deleting while the request is pending, and clears it after a failure", async () => {
    const { result } = setup();
    const release = holdNextRemove();

    act(() => result.current.onDelete(first));
    expect(result.current.activeIds.has(first.id)).toBe(true);

    await act(async () => release(err({ type: "NETWORK_ERROR", message: "Offline" })));
    expect(result.current.activeIds.has(first.id)).toBe(false);
  });

  it("sends no second request for a row that is already being deleted", () => {
    const { result } = setup();
    holdNextRemove();

    act(() => {
      result.current.onDelete(first);
      result.current.onDelete(first);
    });
    act(() => result.current.onDelete(first));

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("still lets another row be deleted while one is pending", () => {
    const { result } = setup();
    holdNextRemove();

    act(() => result.current.onDelete(first));
    act(() => result.current.onDelete(second));

    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith(second.id);
    expect(result.current.activeIds.has(first.id)).toBe(true);
    expect(result.current.activeIds.has(second.id)).toBe(true);
  });

  it("clears the row message and the notice when a delete starts", async () => {
    const { result, clearRowMessage } = setup();
    await act(async () => result.current.onDelete(first));
    expect(result.current.notice).not.toBeNull();

    act(() => result.current.onDelete(second));

    expect(clearRowMessage).toHaveBeenCalledWith(second.id);
    expect(result.current.notice).toBeNull();
  });
});

describe("useTodoDeleteFlow success", () => {
  it("shows a notice that names the deleted todo, and no row message", async () => {
    const { result, setRowMessage } = setup();

    await act(async () => result.current.onDelete(first));

    expect(result.current.notice).toBe("Deleted “Buy milk”.");
    expect(setRowMessage).not.toHaveBeenCalled();
  });

  it("stops marking the row as deleting once it is deleted", async () => {
    const { result } = setup();

    await act(async () => result.current.onDelete(first));

    expect(result.current.activeIds.has(first.id)).toBe(false);
  });

  it("moves focus to the next row's Delete button", async () => {
    const { result } = setup([first, second, third]);
    mountDeleteButton(result, first);
    const next = mountDeleteButton(result, second);
    mountDeleteButton(result, third);

    await act(async () => result.current.onDelete(first));

    expect(next).toHaveFocus();
  });

  it("moves focus to the previous row's Delete button when the last row is deleted", async () => {
    const { result } = setup([first, second, third]);
    mountDeleteButton(result, first);
    const previous = mountDeleteButton(result, second);
    mountDeleteButton(result, third);

    await act(async () => result.current.onDelete(third));

    expect(previous).toHaveFocus();
  });

  it("moves focus to the fallback element when the only row is deleted", async () => {
    const { result } = setup([first]);
    mountDeleteButton(result, first);
    const fallback = mountFocusTarget(result);

    await act(async () => result.current.onDelete(first));

    expect(fallback).toHaveFocus();
  });

  it("moves focus to the fallback element when the neighbour's button is not available", async () => {
    const { result } = setup([first, second]);
    mountDeleteButton(result, first);
    const fallback = mountFocusTarget(result);

    await act(async () => result.current.onDelete(first));

    expect(fallback).toHaveFocus();
  });

  it("does not focus a Delete button that has been removed from the page", async () => {
    const { result } = setup([first, second]);
    mountDeleteButton(result, first);
    const gone = mountDeleteButton(result, second);
    result.current.setDeleteButton(second.id)(null);
    const fallback = mountFocusTarget(result);

    await act(async () => result.current.onDelete(first));

    expect(gone).not.toHaveFocus();
    expect(fallback).toHaveFocus();
  });
});

describe("useTodoDeleteFlow missing todo (404)", () => {
  beforeEach(() => {
    remove.mockResolvedValue(err({ type: "API_ERROR", status: 404, message: "raw-not-found" }));
  });

  it("shows the already-deleted notice and no row message", async () => {
    const { result, setRowMessage } = setup();

    await act(async () => result.current.onDelete(first));

    expect(result.current.notice).toBe(ALREADY_DELETED);
    expect(setRowMessage).not.toHaveBeenCalled();
    expect(result.current.activeIds.has(first.id)).toBe(false);
  });

  it("moves focus the same way as after a success", async () => {
    const { result } = setup([first, second]);
    mountDeleteButton(result, first);
    const next = mountDeleteButton(result, second);

    await act(async () => result.current.onDelete(first));

    expect(next).toHaveFocus();
  });
});

describe("useTodoDeleteFlow unexpected failures", () => {
  it.each<{ name: string; error: ClientError }>([
    { name: "503", error: { type: "API_ERROR", status: 503, message: "secret-internal-detail" } },
    { name: "network", error: { type: "NETWORK_ERROR", message: "secret-internal-detail" } },
    { name: "parse", error: { type: "PARSE_ERROR", message: "secret-internal-detail" } },
    { name: "400", error: { type: "API_ERROR", status: 400, message: "secret-internal-detail" } },
  ])("shows only the safe row message for a $name failure, and no notice", async ({ error }) => {
    remove.mockResolvedValue(err(error));
    const { result, setRowMessage } = setup();

    await act(async () => result.current.onDelete(first));

    expect(setRowMessage).toHaveBeenCalledTimes(1);
    expect(setRowMessage).toHaveBeenCalledWith(first.id, DELETE_FAILED);
    expect(result.current.notice).toBeNull();
    expect(result.current.activeIds.has(first.id)).toBe(false);
  });

  it("does not move focus away from the Delete button", async () => {
    remove.mockResolvedValue(err({ type: "NETWORK_ERROR", message: "Offline" }));
    const { result } = setup([first, second]);
    const button = mountDeleteButton(result, first);
    const neighbour = mountDeleteButton(result, second);
    button.focus();

    await act(async () => result.current.onDelete(first));

    expect(button).toHaveFocus();
    expect(neighbour).not.toHaveFocus();
  });

  it("lets the user try again after a failure", async () => {
    remove.mockResolvedValueOnce(err({ type: "NETWORK_ERROR", message: "Offline" }));
    const { result } = setup();
    await act(async () => result.current.onDelete(first));

    await act(async () => result.current.onDelete(first));

    expect(remove).toHaveBeenCalledTimes(2);
    expect(result.current.notice).toBe("Deleted “Buy milk”.");
  });
});
