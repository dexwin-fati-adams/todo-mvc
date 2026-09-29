import {
  ErrorResponseSchema,
  TodoListResponseSchema,
  type ErrorResponse,
  type TodoListResponse,
} from "contracts";
import { ResultAsync, err, ok, type Result } from "neverthrow";

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type TodoApiError =
  | { type: "NETWORK_ERROR"; cause: unknown }
  | { type: "HTTP_ERROR"; status: number; body: ErrorResponse | null }
  | { type: "INVALID_RESPONSE" };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function fetchTodos(): Promise<Result<TodoListResponse, TodoApiError>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/todos`, {
      headers: { Accept: "application/json" },
    });
  } catch (cause) {
    return err({ type: "NETWORK_ERROR", cause });
  }

  const json = await readJson(response);

  if (!response.ok) {
    const parsedError = ErrorResponseSchema.safeParse(json);
    return err({
      type: "HTTP_ERROR",
      status: response.status,
      body: parsedError.success ? parsedError.data : null,
    });
  }

  const parsed = TodoListResponseSchema.safeParse(json);
  return parsed.success ? ok(parsed.data) : err({ type: "INVALID_RESPONSE" });
}

export function getTodos(): ResultAsync<TodoListResponse, TodoApiError> {
  return new ResultAsync(fetchTodos());
}
