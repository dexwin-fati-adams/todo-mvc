import { err, type Result } from "neverthrow";
import type { Todo, UpdateTodoRequest } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";

//This is only a placeholder for now. toggle always fails and sends nothing, so the tests fail because the real
// behaviour is missing, and not because an import is broken. The next step replaces it.
export function useToggleTodo() {
  return {
    toggle: (id: string, body: UpdateTodoRequest): Promise<Result<Todo, ClientError>> => {
      void id;
      void body;
      return Promise.resolve(err({ type: "NETWORK_ERROR", message: "not implemented" }));
    },
  };
}
