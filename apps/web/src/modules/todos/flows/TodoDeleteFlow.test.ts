import { act, renderHook, waitFor } from "@testing-library/react";
import { err, ok } from "neverthrow";
import type { Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todos/todo.api";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";
import { useTodoDeleteFlow } from "@/modules/todos/flows/TodoDeleteFlow";

vi.mock("@/modules/todos/hooks/useDeleteTodo");

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const second: Todo = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Walk the dog",
  completed: false,
  createdAt: "2026-09-29T11:00:00.000Z",
};

const remove = vi.fn();

beforeEach(() => {
  remove.mockReset();
  remove.mockResolvedValue(ok(undefined));
  vi.mocked(useDeleteTodo).mockReturnValue({ remove });
});

describe("useTodoDeleteFlow", () => {
  it("calls remove once for a delete action and records the pending row", async () => {
    const setRowMessage = vi.fn();
    const clearRowMessage = vi.fn();
    let resolve!: (value: unknown) => void;
    remove.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      }),
    );

    const { result } = renderHook(() =>
      useTodoDeleteFlow({ todos: [todo], setRowMessage, clearRowMessage }),
    );

    act(() => {
      result.current.onDelete(todo);
    });

    expect(result.current.activeIds.has(todo.id)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(todo.id);

    await act(async () => {
      resolve(ok(undefined));
    });
  });

  it("ignores a second click while the row is already deleting", async () => {
    const setRowMessage = vi.fn();
    const clearRowMessage = vi.fn();
    const { result } = renderHook(() =>
      useTodoDeleteFlow({ todos: [todo], setRowMessage, clearRowMessage }),
    );

    act(() => {
      result.current.onDelete(todo);
      result.current.onDelete(todo);
    });

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it("moves focus to the next available row after a success", async () => {
    const setRowMessage = vi.fn();
    const clearRowMessage = vi.fn();
    const { result, rerender } = renderHook(
      ({ todos }) =>
        useTodoDeleteFlow({
          todos,
          setRowMessage,
          clearRowMessage,
        }),
      { initialProps: { todos: [todo, second] as Todo[] } },
    );

    const firstButton = document.createElement("button");
    const secondButton = document.createElement("button");
    const list = document.createElement("div");
    list.tabIndex = -1;
    document.body.appendChild(firstButton);
    document.body.appendChild(secondButton);
    document.body.appendChild(list);

    result.current.setDeleteButton(todo.id)(firstButton);
    result.current.setDeleteButton(second.id)(secondButton);
    result.current.setFocusTarget(list);

    act(() => {
      result.current.onDelete(todo);
    });

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    rerender({ todos: [second] });
    await waitFor(() => expect(result.current.notice).toBe("Deleted “Buy milk”."));
    expect(document.activeElement).toBe(secondButton);

    document.body.removeChild(firstButton);
    document.body.removeChild(secondButton);
    document.body.removeChild(list);
  });

  it("shows a safe failure message without leaking raw details", async () => {
    const setRowMessage = vi.fn();
    const clearRowMessage = vi.fn();
    remove.mockResolvedValue(err<ClientError>({ type: "API_ERROR", status: 503, message: "secret" }));

    const { result } = renderHook(() =>
      useTodoDeleteFlow({ todos: [todo], setRowMessage, clearRowMessage }),
    );

    act(() => {
      result.current.onDelete(todo);
    });

    await waitFor(() => expect(setRowMessage).toHaveBeenCalledWith(todo.id, "Could not delete this todo. Please try again."));
    expect(clearRowMessage).toHaveBeenCalledWith(todo.id);
  });

  it("shows the already-gone notice for a 404", async () => {
    const setRowMessage = vi.fn();
    const clearRowMessage = vi.fn();
    remove.mockResolvedValue(err<ClientError>({ type: "API_ERROR", status: 404, message: "missing" }));

    const { result } = renderHook(() =>
      useTodoDeleteFlow({ todos: [todo], setRowMessage, clearRowMessage }),
    );

    act(() => {
      result.current.onDelete(todo);
    });

    await waitFor(() =>
      expect(result.current.notice).toBe("That todo was already deleted. The list has been refreshed."),
    );
  });
});
