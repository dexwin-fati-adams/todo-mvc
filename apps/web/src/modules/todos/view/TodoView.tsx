import { match } from "ts-pattern";
import type { Todo } from "contracts";
import type { TodoServerState } from "@/modules/todos/hooks/useTodos";
import type { ClientError } from "@/modules/todos/todo.api";
import { TodoList } from "@/modules/todos/components/TodoList";

export type TodoViewProps = {
  state: TodoServerState;
  todos: Todo[];
  error: ClientError | null;
  onRetry: () => void;
};

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

function EmptyMessage() {
  return <p className="m-0 p-4 text-center text-slate-600">No todos yet.</p>;
}

function ListOrEmpty({ todos }: { todos: Todo[] }) {
  return todos.length === 0 ? <EmptyMessage /> : <TodoList todos={todos} />;
}

export function TodoView({ state, todos, error, onRetry }: TodoViewProps) {
  return match(state)
    .with("initial-loading", () => (
      <p role="status" className="m-0 p-4 text-center text-slate-600">
        Loading todos…
      </p>
    ))
    .with("initial-failure", () => <ErrorBanner error={error} onRetry={onRetry} />)
    .with("empty", () => <EmptyMessage />)
    .with("ready", () => <TodoList todos={todos} />)
    .with("refreshing", () => (
      <section aria-busy="true">
        <p role="status" className="m-0 p-2 text-center text-sm text-slate-600">
          Refreshing…
        </p>
        <ListOrEmpty todos={todos} />
      </section>
    ))
    .with("refresh-failure", () => (
      <section>
        <ErrorBanner error={error} onRetry={onRetry} />
        <ListOrEmpty todos={todos} />
      </section>
    ))
    .exhaustive();
}
