import { match } from "ts-pattern";
import type { Todo } from "contracts";
import type { TodoServerState } from "../hooks/useTodos";
import type { ClientError } from "../todo.api";
import { TodoList } from "../components/TodoList";

export type TodoViewProps = {
  state: TodoServerState;
  todos: Todo[];
  error: ClientError | null;
  onRetry: () => void;
};

// Plain messages only. Raw error details are never shown to the user.
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
    <div role="alert" className="todo-error">
      <p>{errorMessage(error)}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function EmptyMessage() {
  return <p className="todo-empty">No todos yet.</p>;
}

// Used while refreshing and after a failed refresh: the todos we already have stay on screen.
function ListOrEmpty({ todos }: { todos: Todo[] }) {
  return todos.length === 0 ? <EmptyMessage /> : <TodoList todos={todos} />;
}

export function TodoView({ state, todos, error, onRetry }: TodoViewProps) {
  return match(state)
    .with("initial-loading", () => (
      <p role="status" className="todo-loading">
        Loading todos…
      </p>
    ))
    .with("initial-failure", () => <ErrorBanner error={error} onRetry={onRetry} />)
    .with("empty", () => <EmptyMessage />)
    .with("ready", () => <TodoList todos={todos} />)
    .with("refreshing", () => (
      <section aria-busy="true">
        <p role="status" className="todo-refreshing">
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
