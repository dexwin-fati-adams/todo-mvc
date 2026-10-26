import type { ReactNode } from "react";
import { match } from "ts-pattern";
import type { Todo } from "contracts";
import type { TodoServerState } from "@/modules/todos/hooks/useTodos";
import type { ClientError } from "@/api/todos/todo.api";
import { TodoList } from "@/modules/todos/components/TodoList";
import type { TodoEditing } from "@/modules/todos/components/TodoItem";
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
  emptyMessage?: string;
};

//RowProps selects the properties needed from TodoViewProps, while errorMessage()
//  checks the type of error and returns a simple message telling the user what went wrong.
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
    .otherwise(() => "Something went wrong. Please try again.");
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

// This is basically for an empty todo

function EmptyMessage({
  setFocusTarget,
  message,
}: {
  setFocusTarget: ((element: HTMLElement | null) => void) | undefined;
  message?: string;
}) {
  return (
    <p
      ref={setFocusTarget}
      tabIndex={setFocusTarget !== undefined ? -1 : undefined}
      className="m-0 p-4 text-center text-slate-600"
    >
      {message ?? "No todos yet."}
    </p>
  );
}
//ListOrEmpty shows “No todos yet” if the list is empty, otherwise it displays the todo list.
function ListOrEmpty({
  todos,
  emptyMessage,
  ...rowProps
}: { todos: Todo[]; emptyMessage?: string } & RowProps) {
  return todos.length === 0 ? (
    <EmptyMessage setFocusTarget={rowProps.deleting?.setFocusTarget} message={emptyMessage} />
  ) : (
    <TodoList todos={todos} {...rowProps} />
  );
}

function ListSection({
  banner,
  busy,
  todos,
  emptyMessage,
  ...rowProps
}: { banner: ReactNode; busy: boolean; todos: Todo[]; emptyMessage?: string } & RowProps) {
  return (
    <section aria-busy={busy ? "true" : undefined}>
      {banner}
      <ListOrEmpty todos={todos} emptyMessage={emptyMessage} {...rowProps} />
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
  emptyMessage,
}: TodoViewProps) {
  const rowProps = { onToggle, pendingIds, rowMessages, editing, deleting };
  //This code gets the deletion message if one exists;
  // otherwise, it sets notice to null (nothing to show).
  //The notice displays a message to the user about the todo deletion,
  //  such as whether the deletion was successful or failed.
  const notice = deleting?.notice ?? null;

  const content: ReactNode = match(state)
    .with("initial-loading", () => (
      <p role="status" className="m-0 p-4 text-center text-slate-600">
        Loading todos…
      </p>
    ))
    .with("initial-failure", () => <ErrorBanner error={error} onRetry={onRetry} />)
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
    .otherwise(() => null);

  return (
    <>
      {notice !== null ? (
        <p role="status" className="m-0 p-2 text-center text-sm text-slate-600">
          {notice}
        </p>
      ) : null}
      {/* Render an empty-message variant when the derived state is empty, otherwise
          render the prepared content. When ready, forward `emptyMessage` to ListSection
          so ListOrEmpty renders a contextual EmptyMessage when the list is empty. */}
      {state === "empty" ? (
        <EmptyMessage setFocusTarget={deleting?.setFocusTarget} message={emptyMessage} />
      ) : state === "ready" ? (
        <ListSection
          banner={null}
          busy={false}
          todos={todos}
          {...rowProps}
          emptyMessage={emptyMessage}
        />
      ) : (
        content
      )}
    </>
  );
}
