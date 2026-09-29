import { afterEach, describe, expect, it, vi } from "vitest";
import { formatError, todoClient } from "./todo.api";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("todoClient.list", () => {
  it("returns the parsed list when the API responds 200 with a valid body", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    const result = await todoClient.list();

    expect(result._unsafeUnwrap()).toEqual(validList);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/todos$/);
  });

  it("sends status, search, page and pageSize as query parameters", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    await todoClient.list({ status: "active", page: 2, search: "milk" });

    const url = new URL(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url.pathname).toBe("/todos");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("search")).toBe("milk");
  });

  it("returns PARSE_ERROR when the body fails the schema", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ todos: "not-a-list" })));

    const result = await todoClient.list();

    expect(result._unsafeUnwrapErr().type).toBe("PARSE_ERROR");
  });

  it("returns PARSE_ERROR when a 200 body is not JSON", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>oops</html>", { status: 200 })));

    const result = await todoClient.list();

    expect(result._unsafeUnwrapErr().type).toBe("PARSE_ERROR");
  });

  it("returns API_ERROR with status and message for a 503", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: "SERVICE_UNAVAILABLE", message: "Try again later" }, 503),
      ),
    );

    const result = await todoClient.list();

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

    const result = await todoClient.list();

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

    const result = await todoClient.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "API_ERROR",
      status: 500,
      message: "Server Error",
    });
  });

  it("returns NETWORK_ERROR when fetch throws", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await todoClient.list();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "NETWORK_ERROR",
      message: "Failed to fetch",
    });
  });
});

describe("todoClient other routes", () => {
  it("get sends GET /todos/:id and returns the todo", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(todo)));

    const result = await todoClient.get(todo.id);

    expect(result._unsafeUnwrap()).toEqual(todo);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(new RegExp(`/todos/${todo.id}$`));
  });

  it("create sends POST /todos with a JSON body", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(todo, 201)));

    const result = await todoClient.create({ title: "Buy milk" });

    expect(result._unsafeUnwrap()).toEqual(todo);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(/\/todos$/);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ title: "Buy milk" }));
  });

  it("replace sends PUT /todos/:id", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(todo)));

    await todoClient.replace(todo.id, { title: "Buy milk", completed: false });

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
  });

  it("update sends PATCH /todos/:id", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ...todo, completed: true })));

    const result = await todoClient.update(todo.id, { completed: true });

    expect(result._unsafeUnwrap().completed).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(new RegExp(`/todos/${todo.id}$`));
    expect(init?.method).toBe("PATCH");
  });

  it("delete sends DELETE /todos/:id and accepts 204", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

    const result = await todoClient.delete(todo.id);

    expect(result.isOk()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(new RegExp(`/todos/${todo.id}$`));
    expect(init?.method).toBe("DELETE");
  });

  it("delete returns API_ERROR with status 404 when the todo does not exist", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ error: "NOT_FOUND", message: "Todo not found" }, 404)),
    );

    const result = await todoClient.delete(todo.id);

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "API_ERROR",
      status: 404,
      message: "Todo not found",
    });
  });

  it("setAllCompleted sends PATCH /todos and returns updatedCount", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ updatedCount: 2 })));

    const result = await todoClient.setAllCompleted({ completed: true });

    expect(result._unsafeUnwrap()).toEqual({ updatedCount: 2 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(/\/todos$/);
    expect(init?.method).toBe("PATCH");
  });

  it("toggleAll sends POST /todos/toggle-all and accepts 204", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

    const result = await todoClient.toggleAll();

    expect(result.isOk()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(/\/todos\/toggle-all$/);
    expect(init?.method).toBe("POST");
  });

  it("clearCompleted sends DELETE /todos?status=completed and returns deletedCount", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ deletedCount: 3 })));

    const result = await todoClient.clearCompleted();

    expect(result._unsafeUnwrap()).toEqual({ deletedCount: 3 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toMatch(/\/todos\?status=completed$/);
    expect(init?.method).toBe("DELETE");
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