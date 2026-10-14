import { err, type Result } from "neverthrow";
import type { ClientError } from "@/api/todos/todo.api";

//This is only a placeholder for now. remove always fails and sends nothing, so the tests fail because the real
// behaviour is missing, and not because an import is broken. The next step replaces it.
export function useDeleteTodo() {
  return {
    remove: (id: string): Promise<Result<undefined, ClientError>> => {
      void id;
      return Promise.resolve(err({ type: "NETWORK_ERROR", message: "not implemented" }));
    },
  };
}
