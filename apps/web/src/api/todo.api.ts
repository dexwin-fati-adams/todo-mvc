import { match, P } from "ts-pattern";
import { err, errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import type { z } from "zod";
import {
  ErrorResponseSchema,
  TodoListResponseSchema,
  TodoSchema,
  type CreateTodoRequest,
  type Status,
} from "contracts";
import { config } from "@/config";

//These lines define the three possible types of errors—API, network, and parsing errors—and combine them into one ClientError
//  type that the app can use to handle any of them.

type ApiError = { type: "API_ERROR"; status: number; message: string };
type NetworkError = { type: "NETWORK_ERROR"; message: string };
type ParseError = { type: "PARSE_ERROR"; message: string };
export type ClientError = ApiError | NetworkError | ParseError;

//This function takes a ClientError and turns it into a simple, readable error message depending on whether it is an API,
//  network, or parsing error.
export function formatError(error: ClientError): string {
  return match(error)
    .with({ type: "API_ERROR" }, ({ status, message }) => `API error ${status}: ${message}`)
    .with({ type: "NETWORK_ERROR" }, ({ message }) => `Network error: ${message}`)
    .with({ type: "PARSE_ERROR" }, ({ message }) => `Parse error: ${message}`)
    .exhaustive();
}
//This function takes a failed backend response, tries to read its error message, and turns it into a structured API_ERROR
// containing the HTTP status and message.
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

//send() sends a request to the backend, handles network failures, and checks whether the HTTP response was successful or an API error.
//It can also carry a method and a JSON body, and it adds the Content-Type header only when there is a body.
function send(path: string, init: RequestInit = {}): ResultAsync<Response, ClientError> {
  const contentTypeHeader = match(init.body !== null && init.body !== undefined)
    .with(true, () => ({ "Content-Type": "application/json" }))
    .with(false, () => ({}))
    .exhaustive();

  return ResultAsync.fromPromise(
    fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...contentTypeHeader, ...init.headers },
    }),
    (e): ClientError => ({
      type: "NETWORK_ERROR",
      message: e instanceof Error ? e.message : "Network error",
    }),
  ).andThen((res): ResultAsync<Response, ClientError> => (res.ok ? okAsync(res) : toApiError(res)));
}

//request() uses send() to get the response, converts it to JSON, checks that the JSON matches the expected Zod schema,
//  and returns either valid data or a parsing error.
function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): ResultAsync<T, ClientError> {
  return send(path, init).andThen((res) =>
    ResultAsync.fromPromise(res.json(), (): ClientError => ({
      type: "PARSE_ERROR",
      message: "Failed to parse response body",
    })).andThen((json: unknown): Result<T, ClientError> => {
      const parsed = schema.safeParse(json);
      return parsed.success
        ? ok<T, ClientError>(parsed.data)
        : err<T, ClientError>({ type: "PARSE_ERROR", message: parsed.error.message });
    }),
  );
}

//ListQuery defines the optional filters and pagination information that can be sent when requesting the todo list.
export type ListQuery = {
  status?: Status;
  search?: string;
  page?: number;
  pageSize?: number;
};

//toQueryString() takes those filters and converts them into the query part of a URL, such as ?status=completed&page=1.
function toQueryString(query: ListQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    match<string | number | undefined>(value)
      .with(undefined, () => undefined)
      .with(P.union(P.string, P.number), (defined) => {
        params.set(key, String(defined));
      })
      .exhaustive();
  });
  const text = params.toString();
  return match(text === "")
    .with(true, () => "")
    .with(false, () => `?${text}`)
    .exhaustive();
}
//This creates a list function that asks the backend for todos, adds any filters to the /todos URL,
// and checks that the response has the correct todo format.
//create sends the new todo's title to the backend with POST /todos and checks that the response is a valid todo.
export const todoApi = {
  list: (query: ListQuery = {}) => request(`/todos${toQueryString(query)}`, TodoListResponseSchema),
  create: (body: CreateTodoRequest) =>
    request("/todos", TodoSchema, { method: "POST", body: JSON.stringify(body) }),
};
