import type { Status } from "contracts";
import { useTodos } from "@/modules/todos/hooks/useTodos";
import { TodoView } from "@/modules/todos/view/TodoView";

export function TodoFlows({ status = "all" }: { status?: Status }) {
  const { serverState, todos, error, refetch } = useTodos(status);

  return <TodoView state={serverState} todos={todos} error={error} onRetry={refetch} />;
}
