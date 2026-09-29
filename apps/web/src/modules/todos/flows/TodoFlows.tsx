import type { Status } from "contracts";
import { useTodos } from "../hooks/useTodos";
import { TodoView } from "../view/TodoView";

// The flow connects the hook (server state) to the view (rendering).
// It holds no fetch calls and no markup of its own.
export function TodoFlows({ status = "all" }: { status?: Status }) {
  const { serverState, todos, error, refetch } = useTodos(status);

  return <TodoView state={serverState} todos={todos} error={error} onRetry={refetch} />;
}
