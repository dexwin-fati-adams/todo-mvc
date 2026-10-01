import { afterEach, describe, expect, it, vi } from "vitest";
import { formatError, todoApi } from "@/api/todo.api";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const validList = {
  todos: [todo],
  activeCount: 1,
  completedCount: 0,
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(impl: Fetch) {
  const fetchMock = vi.fn<Fetch>(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  const url = fetchMock.mock.calls[0]?.[0] ?? "";
  return new URL(url, "http://localhost");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("todoApi.list", () => {
  it("returns the parsed list when the API responds 200 with a valid body", async () => {
    stubFetch(() => Promise.resolve(jsonResponse(validList)));

    const result = await todoApi.list();

    expect(result._unsafeUnwrap()).toEqual(validList);
  });

  it("requests /todos with no query string when no query is given", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list();

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/todos$/);
  });

  it("requests /todos with no query string for an empty query", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list({});

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/todos$/);
  });

  it("sends the status as a query parameter", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list({ status: "active" });

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/todos\?status=active$/);
  });

  it("sends search, page and pageSize as query parameters", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list({ status: "completed", search: "milk", page: 2, pageSize: 10 });

    const { pathname, searchParams } = calledUrl(fetchMock);
    expect(pathname).toMatch(/\/todos$/);
    expect(searchParams.get("status")).toBe("completed");
    expect(searchParams.get("search")).toBe("milk");
    expect(searchParams.get("page")).toBe("2");
    expect(searchParams.get("pageSize")).toBe("10");
  });

  it("omits undefined values from the query string", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list({ status: undefined, search: "milk" });

    const { searchParams } = calledUrl(fetchMock);
    expect(searchParams.has("status")).toBe(false);
    expect(searchParams.get("search")).toBe("milk");
  });

  it("url-encodes the search term", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list({ search: "buy milk & eggs" });

    expect(calledUrl(fetchMock).searchParams.get("search")).toBe("buy milk & eggs");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("& eggs");
  });

  it("sends an Accept: application/json header", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoApi.list();

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Accept: "application/json" });
  });

  it("returns PARSE_ERROR when the body fails the schema", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ todos: "not-a-list" })));

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr().type).toBe("PARSE_ERROR");
  });

  it("returns PARSE_ERROR when a 200 body is not JSON", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>oops</html>", { status: 200 })));

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "PARSE_ERROR",
      message: "Failed to parse response body",
    });
  });

  it("returns API_ERROR with status and message for a 503", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: "SERVICE_UNAVAILABLE", message: "Try again later" }, 503),
      ),
    );

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "API_ERROR",
      status: 503,
      message: "Try again later",
    });
  });

  it("returns API_ERROR with status and message for a 400", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ error: "VALIDATION_ERROR", message: "Bad query" }, 400)),
    );

    const result = await todoApi.list({ page: -1 });

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "API_ERROR",
      status: 400,
      message: "Bad query",
    });
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    stubFetch(() =>
      Promise.resolve(new Response("boom", { status: 500, statusText: "Server Error" })),
    );

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "API_ERROR",
      status: 500,
      message: "Server Error",
    });
  });

  it("falls back to the status text when the error body has the wrong shape", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ unexpected: true }), {
          status: 502,
          statusText: "Bad Gateway",
        }),
      ),
    );

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "API_ERROR",
      status: 502,
      message: "Bad Gateway",
    });
  });

  it("returns NETWORK_ERROR when fetch throws", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "NETWORK_ERROR",
      message: "Failed to fetch",
    });
  });

  it("returns a generic NETWORK_ERROR message when a non-Error is thrown", async () => {
    stubFetch(() => Promise.reject("nope"));

    const result = await todoApi.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "NETWORK_ERROR",
      message: "Network error",
    });
  });
});

describe("formatError", () => {
  it("formats each error type", () => {
    expect(formatError({ type: "API_ERROR", status: 503, message: "Down" })).toBe(
      "API error 503: Down",
    );
    expect(formatError({ type: "NETWORK_ERROR", message: "Offline" })).toBe(
      "Network error: Offline",
    );
    expect(formatError({ type: "PARSE_ERROR", message: "Bad" })).toBe("Parse error: Bad");
  });
});
