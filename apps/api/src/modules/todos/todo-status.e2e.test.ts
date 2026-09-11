import { afterAll, afterEach, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

import { createDb, type Db } from "../../lib/db.js";
import { config } from "../../lib/config.js";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://todo_test_user:todo_test_password@localhost:5435/todo_test_db";
process.env.PORT ??= "0";
process.env.HOST ??= "127.0.0.1";
process.env.CORS_ORIGIN ??= "http://localhost:3000";

// A single db connection shared by every describe block below, used only to
// reset state between tests. There is no DELETE route on the API (delete is
// intentionally not supported as a feature), so cleanup goes straight to the
// database rather than through HTTP.
const db: Db = createDb(config);

/**
 * Removes every todo currently in the database, not just completed ones.
 *
 * This suite runs against a real, persistent Postgres instance rather than
 * an in-memory/reset-per-run database, so any todo left behind by a test
 * leaks into later tests/runs and causes spurious failures (e.g. an old
 * "Buy milk" row showing up in a result a much later test expects to be
 * empty). Truncating before every test guarantees a clean slate regardless
 * of what earlier tests (or earlier runs) left behind.
 */
async function clearAllTodos(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE todos RESTART IDENTITY CASCADE`);
}

describe("GET /todos — status query handling (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    await clearAllTodos();
  });

  afterEach(async () => {
    await clearAllTodos();
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
    await clearAllTodos();
  });

  afterEach(async () => {
    await clearAllTodos();
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
    await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });

    // "Buy milk" above is not completed, so a filter requiring both
    // status=completed and a search match on "milk" should exclude it.
    const res = await app.inject({
      method: "GET",
      url: "/todos?status=completed&search=milk",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().todos).toEqual([]);
  });
});

describe("GET /todos — pagination query handling (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    await clearAllTodos();
  });

  afterEach(async () => {
    await clearAllTodos();
  });

  afterAll(async () => {
    await app.close();
  });

  it("defaults to page 1 and pageSize 20 when omitted", async () => {
    const res = await app.inject({ method: "GET", url: "/todos" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it("accepts explicit page and pageSize", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?page=1&pageSize=5" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
  });

  it("limits results to pageSize and reports totalItems/totalPages correctly", async () => {
    for (const title of ["Todo A", "Todo B", "Todo C"]) {
      const created = await app.inject({ method: "POST", url: "/todos", payload: { title } });
      expect(created.statusCode).toBe(201);
    }

    const res = await app.inject({ method: "GET", url: "/todos?pageSize=2&page=1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.todos.length).toBeLessThanOrEqual(2);
    expect(body.totalItems).toBeGreaterThanOrEqual(3);
    expect(body.totalPages).toBe(Math.ceil(body.totalItems / 2));
  });

  it("returns an empty todos array for a page beyond the last page", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?page=9999&pageSize=10" });
    expect(res.statusCode).toBe(200);
    expect(res.json().todos).toEqual([]);
  });

  it("rejects page below 1", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?page=0" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-numeric page", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?page=abc" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects pageSize below 1", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?pageSize=0" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects pageSize over 100", async () => {
    const res = await app.inject({ method: "GET", url: "/todos?pageSize=101" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("GET /todos/:id — single todo lookup (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    await clearAllTodos();
  });

  afterEach(async () => {
    await clearAllTodos();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the todo when it exists", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({ method: "GET", url: `/todos/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(id);
    expect(res.json().title).toBe("Buy milk");
  });

  it("returns 404 for a well-formed but nonexistent id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/todos/00000000-0000-0000-0000-000000000099",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid uuid", async () => {
    const res = await app.inject({ method: "GET", url: "/todos/not-a-uuid" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("PUT /todos/:id — replace todo (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    await clearAllTodos();
  });

  afterEach(async () => {
    await clearAllTodos();
  });

  afterAll(async () => {
    await app.close();
  });

  it("replaces both fields when the todo exists", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PUT",
      url: `/todos/${id}`,
      payload: { title: "Buy eggs", completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: "Buy eggs", completed: true });
  });

  it("rejects a partial body — same payload PATCH would accept", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { title: "Only title" },
    });
    expect(patchRes.statusCode).toBe(200);

    const putRes = await app.inject({
      method: "PUT",
      url: `/todos/${id}`,
      payload: { title: "Only title" },
    });
    expect(putRes.statusCode).toBe(400);
    expect(putRes.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty object body", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({ method: "PUT", url: `/todos/${id}`, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown fields", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PUT",
      url: `/todos/${id}`,
      payload: { title: "x", completed: false, archived: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects client-supplied id and createdAt", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const resId = await app.inject({
      method: "PUT",
      url: `/todos/${id}`,
      payload: { title: "x", completed: false, id: "00000000-0000-0000-0000-000000000099" },
    });
    expect(resId.statusCode).toBe(400);

    const resCreatedAt = await app.inject({
      method: "PUT",
      url: `/todos/${id}`,
      payload: { title: "x", completed: false, createdAt: "2024-01-01T00:00:00Z" },
    });
    expect(resCreatedAt.statusCode).toBe(400);
  });

  it("returns 404 for a well-formed but nonexistent id, and does not create it", async () => {
    const missingId = "00000000-0000-0000-0000-000000000099";
    const res = await app.inject({
      method: "PUT",
      url: `/todos/${missingId}`,
      payload: { title: "Ghost", completed: false },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");

    const getRes = await app.inject({ method: "GET", url: `/todos/${missingId}` });
    expect(getRes.statusCode).toBe(404);
  });

  it("returns 400 for an invalid uuid", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/todos/not-a-uuid",
      payload: { title: "x", completed: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /todos/:id — update todo (real app, real database)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../../app.js");
    app = await buildApp();
    await app.ready();
    await clearAllTodos();
  });

  afterEach(async () => {
    await clearAllTodos();
  });

  afterAll(async () => {
    await app.close();
  });

  it("updates the title only, leaving completed untouched", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    await app.inject({ method: "PATCH", url: `/todos/${id}`, payload: { completed: true } });

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { title: "Buy eggs" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Buy eggs");
    expect(res.json().completed).toBe(true);

    const getRes = await app.inject({ method: "GET", url: `/todos/${id}` });
    expect(getRes.json()).toMatchObject({ title: "Buy eggs", completed: true });
  });

  it("updates completed only, leaving title untouched", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: "Buy milk", completed: true });
  });

  it("updates title and completed together in one request", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { title: "Buy eggs", completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: "Buy eggs", completed: true });
  });

  it("rejects an empty object body", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({ method: "PATCH", url: `/todos/${id}`, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");

    const getRes = await app.inject({ method: "GET", url: `/todos/${id}` });
    expect(getRes.json()).toMatchObject({ title: "Buy milk", completed: false });
  });

  it("rejects unknown fields", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { archived: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a well-formed but nonexistent id", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/todos/00000000-0000-0000-0000-000000000099",
      payload: { title: "Buy eggs" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid uuid", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/todos/not-a-uuid",
      payload: { title: "Buy eggs" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

afterAll(async () => {
  await db.$client.end();
});