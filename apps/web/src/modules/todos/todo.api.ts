import { match } from "ts-pattern";
import { err, errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import type { z } from "zod";
import { ErrorResponseSchema, TodoListResponseSchema, type Status } from "contracts";
import { config } from "@/config";

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

function send(path: string): ResultAsync<Response, ClientError> {
  return ResultAsync.fromPromise(
    fetch(`${config.apiUrl}${path}`, { headers: { Accept: "application/json" } }),
    (e): ClientError => ({
      type: "NETWORK_ERROR",
      message: e instanceof Error ? e.message : "Network error",
    }),
  ).andThen((res): ResultAsync<Response, ClientError> => (res.ok ? okAsync(res) : toApiError(res)));
}

function request<T>(path: string, schema: z.ZodType<T>): ResultAsync<T, ClientError> {
  return send(path).andThen((res) =>
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

export const todoApi = {
  list: (query: ListQuery = {}) => request(`/todos${toQueryString(query)}`, TodoListResponseSchema),
};
