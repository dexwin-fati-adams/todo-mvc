import { useCallback, useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import type { Result } from "neverthrow";
import type { Todo } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import type { TodoDeleting } from "@/modules/todos/components/TodoItem";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";

const FAILED_MESSAGE = "Could not delete this todo. Please try again.";
const ALREADY_DELETED_NOTICE = "That todo was already deleted. The list has been refreshed.";

type DeleteOutcome =
  { kind: "deleted" } | { kind: "already-gone" } | { kind: "failed"; message: string };

function toOutcome(result: Result<undefined, ClientError>): DeleteOutcome {
  return result.match<DeleteOutcome>(
    () => ({ kind: "deleted" }),
    (error) =>
      match<ClientError, DeleteOutcome>(error)
        .with({ type: "API_ERROR", status: 404 }, () => ({ kind: "already-gone" }))
        .with({ type: "API_ERROR" }, { type: "NETWORK_ERROR" }, { type: "PARSE_ERROR" }, () => ({
          kind: "failed",
          message: FAILED_MESSAGE,
        }))
        .exhaustive(),
  );
}

type UseTodoDeleteFlowParams = {
  todos: Todo[];
  setRowMessage: (id: string, message: string) => void;
  clearRowMessage: (id: string) => void;
};

export function useTodoDeleteFlow({
  todos,
  setRowMessage,
  clearRowMessage,
}: UseTodoDeleteFlowParams): TodoDeleting {
  const { remove } = useDeleteTodo();
  const deletingRef = useRef(new Set<string>());
  const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  const focusTargetRef = useRef<HTMLElement | null>(null);
  //deleted id -> id of the row whose Delete button should get focus (null means use the fallback)
  const focusPlansRef = useRef(new Map<string, string | null>());

  const setFocusTarget = useCallback((element: HTMLElement | null) => {
    focusTargetRef.current = element;
  }, []);

  const setDeleteButton = (id: string) => (element: HTMLButtonElement | null) => {
    if (element === null) {
      buttonsRef.current.delete(id);
      return;
    }
    buttonsRef.current.set(id, element);
  };

  useEffect(() => {
    const finished = [...focusPlansRef.current.entries()].filter(
      ([deletedId]) => !todos.some((todo) => todo.id === deletedId),
    );
    finished.forEach(([deletedId]) => focusPlansRef.current.delete(deletedId));

    const last = finished.at(-1);
    if (last === undefined) {
      return;
    }
    const [, neighbourId] = last;
    const neighbourButton = neighbourId === null ? undefined : buttonsRef.current.get(neighbourId);
    (neighbourButton ?? focusTargetRef.current)?.focus();
  }, [todos, activeIds]);

  const neighbourOf = (todo: Todo): string | null => {
    const index = todos.findIndex((candidate) => candidate.id === todo.id);
    const candidates = [...todos.slice(index + 1), ...todos.slice(0, index).reverse()];
    return candidates.find((candidate) => !deletingRef.current.has(candidate.id))?.id ?? null;
  };

  const start = (todo: Todo) => {
    focusPlansRef.current.set(todo.id, neighbourOf(todo));
    deletingRef.current.add(todo.id);
    setActiveIds(new Set(deletingRef.current));
    setNotice(null);
    clearRowMessage(todo.id);

    void remove(todo.id).then((result) => {
      deletingRef.current.delete(todo.id);
      match(toOutcome(result))
        .with({ kind: "deleted" }, () => setNotice(`Deleted “${todo.title}”.`))
        .with({ kind: "already-gone" }, () => setNotice(ALREADY_DELETED_NOTICE))
        .with({ kind: "failed" }, ({ message }) => {
          focusPlansRef.current.delete(todo.id);
          setRowMessage(todo.id, message);
        })
        .exhaustive();
      setActiveIds(new Set(deletingRef.current));
    });
  };

  const onDelete = (todo: Todo) => {
    match(deletingRef.current.has(todo.id))
      .with(true, () => undefined)
      .with(false, () => start(todo))
      .exhaustive();
  };

  return { activeIds, notice, setDeleteButton, setFocusTarget, onDelete };
}
