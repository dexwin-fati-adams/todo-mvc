import { afterAll, afterEach, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://todo_test_user:todo_test_password@localhost:5435/todo_test_db";
process.env.PORT ??= "0";
process.env.HOST ??= "127.0.0.1";
process.env.CORS_ORIGIN ??= "http://localhost:3000";

describe("GET /todos — status query handling (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.inject({ method: "DELETE", url: "/todos/completed" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("defaults to all todos when status is omitted", async () => {
    const res = await app.inject({ method: "GET", url: "/todos" });
    expect(res.statusCode).toBe(200);
  });

  it("accepts a single valid status", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?status=active" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects an invalid status value", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?status=bogus" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate status query params over real HTTP", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?status=all&status=active" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown query keys", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?status=all&foo=bar" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("GET /todos — search query handling (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.inject({ method: "DELETE", url: "/todos/completed" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns matching todos when search matches a title", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });

    const res = await app.inject({ method: "GET", url: "/todos?search=milk" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.todos.length).toBeGreaterThan(0);
    expect(body.todos.every((t: { title: string }) => t.title.toLowerCase().includes("milk"))).toBe(
      true,
    );
  });

  it("is case-insensitive", async () => {
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });

    const res = await app.inject({ method: "GET", url: "/todos?search=MILK" });
    expect(res.statusCode).toBe(200);
    expect(res.json().todos.length).toBeGreaterThan(0);
  });

  it("returns an empty array when nothing matches", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?search=xyz123nonsense" });
    expect(res.statusCode).toBe(200);
    expect(res.json().todos).toEqual([]);
  });

  it("rejects an empty search value", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?search=" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a search value over 100 characters", async () => {
    const longSearch = "a".repeat(101);
    const res = await app.inject({ method: "GET", url: `/todos?search=${longSearch}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("combines status and search filters with AND", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    // "Buy milk" is active, not completed — searching completed+milk should return nothing
    const res = await app.inject({
      method: "GET",
      url: "/todos?status=completed&search=milk",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().todos).toEqual([]);

    // cleanup: this todo won't be caught by the afterEach (only clears completed)
    await app.inject({ method: "DELETE", url: `/todos/${id}` });
  });
});
