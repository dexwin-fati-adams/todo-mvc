import type { ReactNode } from "react";
import { match } from "ts-pattern";
import type { Todo } from "contracts";
import type { TodoServerState } from "@/modules/todos/hooks/useTodos";
import type { ClientError } from "@/api/todos/todo.api";
import { TodoList } from "@/modules/todos/components/TodoList";
import type { TodoDeleting, TodoEditing } from "@/modules/todos/components/TodoItem";

export type TodoViewProps = {
  state: TodoServerState;
  todos: Todo[];
  error: ClientError | null;
  onRetry: () => void;
  onToggle: (todo: Todo) => void;
  pendingIds: ReadonlySet<string>;
  rowMessages: Readonly<Record<string, string>>;
  editing?: TodoEditing;
  deleting?: TodoDeleting;
};

type RowProps = Pick<
  TodoViewProps,
  "onToggle" | "pendingIds" | "rowMessages" | "editing" | "deleting"
>;

function errorMessage(error: ClientError | null): string {
  return match(error)
    .with(null, () => "Something went wrong. Please try again.")
    .with({ type: "NETWORK_ERROR" }, () => "We can't reach the server. Check your connection.")
    .with(
      { type: "API_ERROR" },
      { type: "PARSE_ERROR" },
      () => "Something went wrong on our side. Please try again.",
    )
    .exhaustive();
}

function ErrorBanner({ error, onRetry }: { error: ClientError | null; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 bg-red-50 px-4 py-3 text-red-900"
    >
      <p className="m-0">{errorMessage(error)}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-current px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        Retry
      </button>
    </div>
  );
}

//The empty message can take focus (tabIndex -1) when the list is wired for deleting. After the last todo is deleted
// there is no row left, so focus goes here.
function EmptyMessage({
  setFocusTarget,
}: {
  setFocusTarget: ((element: HTMLElement | null) => void) | undefined;
}) {
  return (
    <p
      ref={setFocusTarget}
      tabIndex={setFocusTarget !== undefined ? -1 : undefined}
      className="m-0 p-4 text-center text-slate-600"
    >
      No todos yet.
    </p>
  );
}

function ListOrEmpty({ todos, ...rowProps }: { todos: Todo[] } & RowProps) {
  return todos.length === 0 ? (
    <EmptyMessage setFocusTarget={rowProps.deleting?.setFocusTarget} />
  ) : (
    <TodoList todos={todos} {...rowProps} />
  );
}

//ListSection is used for the ready, refreshing, and refresh-failure states.
//The banner (nothing, "Refreshing…", or the error) always sits in the first slot and the list always sits in the second slot.
// Because the list never changes position in the tree, React keeps the same checkbox elements between those states,
// so a checkbox that has focus does not lose it when the list is refreshed.
function ListSection({
  banner,
  busy,
  todos,
  ...rowProps
}: { banner: ReactNode; busy: boolean; todos: Todo[] } & RowProps) {
  return (
    <section aria-busy={busy ? "true" : undefined}>
      {banner}
      <ListOrEmpty todos={todos} {...rowProps} />
    </section>
  );
}

//The delete notice ("Deleted …" or "already deleted") is shown above everything else, outside the state switch.
// It is not inside ListSection, so it shows in the empty state too, and when it appears it does not move the list.
export function TodoView({
  state,
  todos,
  error,
  onRetry,
  onToggle,
  pendingIds,
  rowMessages,
  editing,
  deleting,
}: TodoViewProps) {
  const rowProps = { onToggle, pendingIds, rowMessages, editing, deleting };
  const notice = deleting?.notice ?? null;

  const content = match(state)
    .with("initial-loading", () => (
      <p role="status" className="m-0 p-4 text-center text-slate-600">
        Loading todos…
      </p>
    ))
    .with("initial-failure", () => <ErrorBanner error={error} onRetry={onRetry} />)
    .with("empty", () => <EmptyMessage setFocusTarget={deleting?.setFocusTarget} />)
    .with("ready", () => <ListSection banner={null} busy={false} todos={todos} {...rowProps} />)
    .with("refreshing", () => (
      <ListSection
        banner={
          <p role="status" className="m-0 p-2 text-center text-sm text-slate-600">
            Refreshing…
          </p>
        }
        busy
        todos={todos}
        {...rowProps}
      />
    ))
    .with("refresh-failure", () => (
      <ListSection
        banner={<ErrorBanner error={error} onRetry={onRetry} />}
        busy={false}
        todos={todos}
        {...rowProps}
      />
    ))
    .exhaustive();

  return (
    <>
      {notice !== null ? (
        <p role="status" className="m-0 p-2 text-center text-sm text-slate-600">
          {notice}
        </p>
      ) : null}
      {content}
    </>
  );
}
