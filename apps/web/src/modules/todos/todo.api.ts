import { match } from "ts-pattern";
import { err, errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import type { z } from "zod";
import {
  DeleteCompletedResponseSchema,
  ErrorResponseSchema,
  SetAllCompletedResponseSchema,
  TodoListResponseSchema,
  TodoSchema,
  type CreateTodoRequest,
  type ReplaceTodoRequest,
  type SetAllCompletedRequest,
  type Status,
  type UpdateTodoRequest,
} from "contracts";
import { config } from "@/config";

const BASE = config.apiUrl;

type ApiError = { type: "API_ERROR"; status: number; message: string };
type NetworkError = { type: "NETWORK_ERROR"; message: string };
type ParseError = { type: "PARSE_ERROR"; message: string };
export type ClientError = ApiError | NetworkError | ParseError;

export function formatError(error: ClientError): string {
  return match(error)
    .with({ type: "API_ERROR" }, ({ status, message }) => `API error ${status}: ${message}`)
    .with({ type: "NETWORK_ERROR" }, ({ message }) => `Network error: ${message}`)
    .with({ type: "PARSE_ERROR" }, ({ message }) => `Parse error: ${message}`)
    .exhaustive();
}

function toApiError(res: Response): ResultAsync<never, ClientError> {
  return ResultAsync.fromSafePromise(res.json().catch((): unknown => null)).andThen((body) => {
    const parsed = ErrorResponseSchema.safeParse(body);
    return errAsync<never, ClientError>({
      type: "API_ERROR",
      status: res.status,
      message: parsed.success ? parsed.data.message : res.statusText,
    });
  });
}

// The only place in the web app that calls fetch.
function send(path: string, init: RequestInit = {}): ResultAsync<Response, ClientError> {
  const hasBody = init.body !== null && init.body !== undefined;

  return ResultAsync.fromPromise(
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    }),
    (e): ClientError => ({
      type: "NETWORK_ERROR",
      message: e instanceof Error ? e.message : "Network error",
    }),
  ).andThen(
    (res): ResultAsync<Response, ClientError> => (res.ok ? okAsync(res) : toApiError(res)),
  );
}

// For responses that have a JSON body we must validate.
function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): ResultAsync<T, ClientError> {
  return send(path, init).andThen((res) =>
    ResultAsync.fromPromise(
      res.json(),
      (): ClientError => ({ type: "PARSE_ERROR", message: "Failed to parse response body" }),
    ).andThen((json: unknown): Result<T, ClientError> => {
      const parsed = schema.safeParse(json);
      return parsed.success
        ? ok<T, ClientError>(parsed.data)
        : err<T, ClientError>({ type: "PARSE_ERROR", message: parsed.error.message });
    }),
  );
}

// For responses with no body (204).
function requestVoid(path: string, init: RequestInit = {}): ResultAsync<void, ClientError> {
  return send(path, init).map(() => undefined);
}

export type ListQuery = {
  status?: Status;
  search?: string;
  page?: number;
  pageSize?: number;
};

function toQueryString(query: ListQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

export const todoClient = {
  // GET /todos
  list: (query: ListQuery = {}) =>
    request(`/todos${toQueryString(query)}`, TodoListResponseSchema),

  // GET /todos/:id
  get: (id: string) => request(`/todos/${encodeURIComponent(id)}`, TodoSchema),

  // POST /todos -> 201
  create: (body: CreateTodoRequest) =>
    request("/todos", TodoSchema, { method: "POST", body: JSON.stringify(body) }),

  // PUT /todos/:id
  replace: (id: string, body: ReplaceTodoRequest) =>
    request(`/todos/${encodeURIComponent(id)}`, TodoSchema, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // PATCH /todos/:id
  update: (id: string, body: UpdateTodoRequest) =>
    request(`/todos/${encodeURIComponent(id)}`, TodoSchema, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // DELETE /todos/:id -> 204
  delete: (id: string) => requestVoid(`/todos/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // PATCH /todos -> { updatedCount }
  setAllCompleted: (body: SetAllCompletedRequest) =>
    request("/todos", SetAllCompletedResponseSchema, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // POST /todos/toggle-all -> 204
  toggleAll: () => requestVoid("/todos/toggle-all", { method: "POST" }),

  // DELETE /todos?status=completed -> { deletedCount }
  clearCompleted: () =>
    request("/todos?status=completed", DeleteCompletedResponseSchema, { method: "DELETE" }),
};