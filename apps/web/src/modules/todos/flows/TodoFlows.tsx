import { useRef, useState } from "react";
import { match } from "ts-pattern";
import type { Todo } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import { StatusFilter } from "@/modules/todos/components/StatusFilter";
import { useStatusFilter } from "@/modules/todos/flows/useStatusFilter";
import { useTodos } from "@/modules/todos/hooks/useTodos";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { useTodoDeleteFlow } from "@/modules/todos/flows/TodoDeleteFlow";
import { TodoView } from "@/modules/todos/view/TodoView";

const STALE_MESSAGE = "This todo no longer exists. The list has been refreshed.";
const FAILED_MESSAGE = "Could not update this todo. Please try again.";

//A stale message means the todo you are trying to change is no longer available or has already been changed
// or deleted, so the information you have may be outdated.
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
//This function creates a new object by copying everything
// from the original object except the key you want to remove.
function withoutKey(record: Readonly<Record<string, string>>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

export function TodoFlows() {
  //The selected status lives in the page address, so a reload, Back, and a shared link all keep it.
  const { status, select } = useStatusFilter();
  const { serverState, todos, counts, error, refetch } = useTodos(status);
  const { toggle } = useToggleTodo();
  const pendingRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [rowMessages, setRowMessages] = useState<Readonly<Record<string, string>>>({});

  const clearRowMessage = (id: string) => {
    setRowMessages((previous) => withoutKey(previous, id));
  };

  const setRowMessage = (id: string, message: string) => {
    setRowMessages((previous) => ({ ...previous, [id]: message }));
  };

  const deleting = useTodoDeleteFlow({
    todos,
    setRowMessage,
    clearRowMessage,
  });

  const start = (todo: Todo) => {
    pendingRef.current.add(todo.id);
    setPendingIds(new Set(pendingRef.current));
    clearRowMessage(todo.id);

    void toggle(todo.id, { completed: !todo.completed }).then((result) => {
      pendingRef.current.delete(todo.id);
      setPendingIds(new Set(pendingRef.current));
      result.match(
        () => undefined,
        (failure) => setRowMessage(todo.id, toRowMessage(failure)),
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
    <>
      <StatusFilter status={status} counts={counts} onSelect={select} />
      <TodoView
        state={serverState}
        todos={todos}
        error={error}
        onRetry={refetch}
        onToggle={onToggle}
        pendingIds={pendingIds}
        rowMessages={rowMessages}
        deleting={deleting}
        emptyMessage={status === "completed" ? "No completed todos." : undefined}
      />
    </>
  );
}
