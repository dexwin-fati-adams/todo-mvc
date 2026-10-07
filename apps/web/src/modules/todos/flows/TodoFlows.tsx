import { useRef, useState } from "react";
import { match } from "ts-pattern";
import type { Status, Todo } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import { useTodos } from "@/modules/todos/hooks/useTodos";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { TodoView } from "@/modules/todos/view/TodoView";

const STALE_MESSAGE = "This todo no longer exists. The list has been refreshed.";
const FAILED_MESSAGE = "Could not update this todo. Please try again.";

//Only these two safe messages are ever shown. Raw errors, status codes, and server messages never reach the user.
function toRowMessage(error: ClientError): string {
  return match(error)
    .with({ type: "API_ERROR", status: 404 }, () => STALE_MESSAGE)
    .with(
      { type: "API_ERROR" },
      { type: "NETWORK_ERROR" },
      { type: "PARSE_ERROR" },
      () => FAILED_MESSAGE,
    )
    .exhaustive();
}

function withoutKey(record: Readonly<Record<string, string>>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

//start marks a Todo as being updated, toggles its completed status, removes the pending state when finished,
//  and shows an error message if the update fails.
export function TodoFlows({ status = "all" }: { status?: Status }) {
  const { serverState, todos, error, refetch } = useTodos(status);
  const { toggle } = useToggleTodo();
  const pendingRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [rowMessages, setRowMessages] = useState<Readonly<Record<string, string>>>({});

  const start = (todo: Todo) => {
    pendingRef.current.add(todo.id);
    setPendingIds(new Set(pendingRef.current));
    setRowMessages((previous) => withoutKey(previous, todo.id));

    void toggle(todo.id, { completed: !todo.completed }).then((result) => {
      pendingRef.current.delete(todo.id);
      setPendingIds(new Set(pendingRef.current));
      result.match(
        () => undefined,
        (failure) =>
          setRowMessages((previous) => ({ ...previous, [todo.id]: toRowMessage(failure) })),
      );
    });
  };

  const onToggle = (todo: Todo) => {
    match(pendingRef.current.has(todo.id))
      .with(true, () => undefined)
      .with(false, () => start(todo))
      .exhaustive();
  };

  return (
    <TodoView
      state={serverState}
      todos={todos}
      error={error}
      onRetry={refetch}
      onToggle={onToggle}
      pendingIds={pendingIds}
      rowMessages={rowMessages}
    />
  );
}
