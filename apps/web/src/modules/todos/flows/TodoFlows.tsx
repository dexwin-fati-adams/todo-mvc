import { useRef, useState } from "react";
import { match, P } from "ts-pattern";
import { SEARCH_MAX_LENGTH, type Status, type Todo } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import { SearchBox } from "@/modules/todos/components/SearchBox";
import { StatusFilter } from "@/modules/todos/components/StatusFilter";
import { buildListUrl } from "@/modules/todos/flows/buildListUrl";
import { useListParams } from "@/modules/todos/flows/useListParams";
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

function emptyMessageFor(status: Status, search: string | null): string | undefined {
  return match({ status, search })
    .with({ status: "completed", search: null }, () => "No completed todos.")
    .with({ search: null }, () => undefined)
    .with({ status: "all", search: P.string }, (value) => `No todos match “${value.search}”.`)
    .with(
      { status: "active", search: P.string },
      (value) => `No active todos match “${value.search}”.`,
    )
    .with(
      { status: "completed", search: P.string },
      (value) => `No completed todos match “${value.search}”.`,
    )
    .exhaustive();
}

export function TodoFlows() {
  //The selected status lives in the page address, so a reload, Back, and a shared link all keep it.
  const { status, search, page, selectStatus, commitSearch } = useListParams();
  const { serverState, todos, counts, error, refetch } = useTodos({ status, search, page });
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

  const hrefFor = (next: Status) =>
    buildListUrl(window.location.pathname, window.location.search, {
      status: next,
      search,
      page: 1,
    });

  return (
    <>
      <SearchBox value={search ?? ""} onCommit={commitSearch} maxLength={SEARCH_MAX_LENGTH} />
      <StatusFilter
        status={status}
        counts={search === null ? counts : null}
        onSelect={selectStatus}
        hrefFor={hrefFor}
      />
      <TodoView
        state={serverState}
        todos={todos}
        error={error}
        onRetry={refetch}
        onToggle={onToggle}
        pendingIds={pendingIds}
        rowMessages={rowMessages}
        deleting={deleting}
        emptyMessage={emptyMessageFor(status, search)}
      />
    </>
  );
}
