import { afterEach, describe, expect, it, vi } from "vitest";
import { getTodos } from "./todo.api";

const validList = {
  todos: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Buy milk",
      completed: false,
      createdAt: "2026-09-29T10:00:00.000Z",
    },
  ],
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

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTodos", () => {
  it("returns the parsed list when the API responds 200 with a valid body", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(validList)));

    const result = await getTodos();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(validList);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/todos$/);
  });

  it("returns INVALID_RESPONSE when the body fails the schema", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ todos: "not-a-list" })));

    const result = await getTodos();

    expect(result._unsafeUnwrapErr()).toEqual({ type: "INVALID_RESPONSE" });
  });

  it("returns HTTP_ERROR with the status for a 503 response", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: "SERVICE_UNAVAILABLE", message: "Try again later" }, 503),
      ),
    );

    const result = await getTodos();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "HTTP_ERROR",
      status: 503,
      body: { error: "SERVICE_UNAVAILABLE", message: "Try again later" },
    });
  });

  it("returns HTTP_ERROR with the parsed error body for a 400 response", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ error: "VALIDATION_ERROR", message: "Bad query" }, 400)),
    );

    const result = await getTodos();

    expect(result._unsafeUnwrapErr()).toEqual({
      type: "HTTP_ERROR",
      status: 400,
      body: { error: "VALIDATION_ERROR", message: "Bad query" },
    });
  });

  it("returns NETWORK_ERROR when fetch throws", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await getTodos();

    expect(result._unsafeUnwrapErr().type).toBe("NETWORK_ERROR");
  });

  it("never throws: a non-JSON 200 body becomes INVALID_RESPONSE", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>oops</html>", { status: 200 })));

    const result = await getTodos();

    expect(result._unsafeUnwrapErr()).toEqual({ type: "INVALID_RESPONSE" });
  });
});
