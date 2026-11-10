import { afterAll, afterEach, beforeAll, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { createDb, type Db } from "../../lib/db.js";
import { config } from "../../lib/config.js";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://todo_test_user:todo_test_password@localhost:5435/todo_test_db";
process.env.PORT ??= "0";
process.env.HOST ??= "127.0.0.1";
process.env.CORS_ORIGIN ??= "http://localhost:4000";

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

  //The search is plain text typed by a user. In LIKE, % means "any text", _ means "any one character" and \ is the escape
  // character, so each one must be matched as itself and not as a pattern.
  async function addTodo(title: string) {
    const res = await app.inject({ method: "POST", url: "/todos", payload: { title } });
    expect(res.statusCode).toBe(201);
  }

  async function searchTitles(search: string): Promise<string[]> {
    const res = await app.inject({
      method: "GET",
      url: `/todos?search=${encodeURIComponent(search)}`,
    });
    expect(res.statusCode).toBe(200);
    return res.json().todos.map((t: { title: string }) => t.title);
  }

  it("matches % as a plain percent sign, not as 'any text'", async () => {
    await addTodo("50% off");
    await addTodo("Buy milk");

    expect(await searchTitles("%")).toEqual(["50% off"]);
  });

  it("matches _ as a plain underscore, not as 'any one character'", async () => {
    await addTodo("my_var");
    await addTodo("myXvar");

    expect(await searchTitles("_")).toEqual(["my_var"]);
  });

  it("matches a backslash as a plain backslash", async () => {
    await addTodo("C:\\temp");
    await addTodo("Buy milk");

    expect(await searchTitles("\\")).toEqual(["C:\\temp"]);
  });

  it("still finds a title with no special characters", async () => {
    await addTodo("Buy milk");
    await addTodo("Walk the dog");

    expect(await searchTitles("milk")).toEqual(["Buy milk"]);
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

  // NOTE: PATCH /todos/:id performs a *partial* update (see the "PATCH
  // /todos/:id — partial update" describe block below), so it accepts a
  // payload with just { title } that PUT's strict, full-body schema
  // rejects. This test demonstrates that divergence directly against the
  // real app rather than assuming it from the unit-level route tests.
  it("rejects a partial body (missing completed)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

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

describe("PATCH /todos/:id — partial update (real app, real database)", () => {
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

  it("updates only the title when just title is sent", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { title: "Buy eggs" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, title: "Buy eggs", completed: false });
  });

  it("updates only completed when just completed is sent", async () => {
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
    expect(res.json()).toMatchObject({ id, title: "Buy milk", completed: true });
  });

  it("updates both title and completed when both are sent", async () => {
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
    expect(res.json()).toMatchObject({ id, title: "Buy eggs", completed: true });
  });

  it("persists the update — a follow-up GET reflects it", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { completed: true },
    });

    const getRes = await app.inject({ method: "GET", url: `/todos/${id}` });
    expect(getRes.json().completed).toBe(true);
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
  });

  it("rejects an empty title string", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { title: "" },
    });
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
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { archived: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown fields even alongside a valid field", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${id}`,
      payload: { title: "Buy eggs", archived: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a well-formed but nonexistent id, and does not create it", async () => {
    const missingId = "00000000-0000-0000-0000-000000000099";
    const res = await app.inject({
      method: "PATCH",
      url: `/todos/${missingId}`,
      payload: { title: "Ghost" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");

    const getRes = await app.inject({ method: "GET", url: `/todos/${missingId}` });
    expect(getRes.statusCode).toBe(404);
  });

  it("returns 400 for an invalid uuid", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/todos/not-a-uuid",
      payload: { title: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("accepts a partial body that PUT would reject for the same todo", async () => {
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
  });
});

describe("PATCH /todos — bulk set completed status (real app, real database)", () => {
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

  it("marks every todo as completed and reports how many were updated", async () => {
    await app.inject({ method: "POST", url: "/todos", payload: { title: "Buy milk" } });
    await app.inject({ method: "POST", url: "/todos", payload: { title: "Walk dog" } });

    const res = await app.inject({
      method: "PATCH",
      url: "/todos",
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updatedCount).toBe(2);

    const listRes = await app.inject({ method: "GET", url: "/todos" });
    expect(listRes.json().todos.every((t: { completed: boolean }) => t.completed)).toBe(true);
  });

  it("marks every todo as active", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();
    await app.inject({
      method: "PUT",
      url: `/todos/${id}`,
      payload: { title: "Buy milk", completed: true },
    });

    const res = await app.inject({
      method: "PATCH",
      url: "/todos",
      payload: { completed: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updatedCount).toBe(1);

    const getRes = await app.inject({ method: "GET", url: `/todos/${id}` });
    expect(getRes.json().completed).toBe(false);
  });

  it("reports zero updated when there are no todos", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/todos",
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updatedCount).toBe(0);
  });

  it("rejects an empty object body", async () => {
    const res = await app.inject({ method: "PATCH", url: "/todos", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/todos",
      payload: { completed: true, archived: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-boolean completed value", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/todos",
      payload: { completed: "yes" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("DELETE /todos?status=completed — bulk delete completed todos (real app, real database)", () => {
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

  it("deletes only completed todos and reports the deleted count", async () => {
    const milk = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const dog = await app.inject({ method: "POST", url: "/todos", payload: { title: "Walk dog" } });
    const { id: milkId } = milk.json();
    const { id: dogId } = dog.json();

    await app.inject({
      method: "PUT",
      url: `/todos/${milkId}`,
      payload: { title: "Buy milk", completed: true },
    });

    const res = await app.inject({ method: "DELETE", url: "/todos?status=completed" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ deletedCount: 1 });

    const getMilk = await app.inject({ method: "GET", url: `/todos/${milkId}` });
    expect(getMilk.statusCode).toBe(404);

    const getDog = await app.inject({ method: "GET", url: `/todos/${dogId}` });
    expect(getDog.statusCode).toBe(200);
  });

  it("returns deletedCount 0 and deletes nothing when no todos are completed", async () => {
    await app.inject({ method: "POST", url: "/todos", payload: { title: "Buy milk" } });

    const res = await app.inject({ method: "DELETE", url: "/todos?status=completed" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ deletedCount: 0 });

    const listRes = await app.inject({ method: "GET", url: "/todos" });
    expect(listRes.json().totalItems).toBeGreaterThanOrEqual(1);
  });

  it("rejects the request when status is missing", async () => {
    const res = await app.inject({ method: "DELETE", url: "/todos" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a status value other than completed", async () => {
    const res = await app.inject({ method: "DELETE", url: "/todos?status=active" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate status query params", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/todos?status=completed&status=completed",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown query keys", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/todos?status=completed&page=2",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("POST /todos/toggle-all — toggle every todo's completed status (real app, real database)", () => {
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

  it("toggles active todos to completed", async () => {
    await app.inject({ method: "POST", url: "/todos", payload: { title: "Buy milk" } });

    const res = await app.inject({ method: "POST", url: "/todos/toggle-all" });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");

    const listRes = await app.inject({ method: "GET", url: "/todos" });
    expect(listRes.json().todos.every((t: { completed: boolean }) => t.completed)).toBe(true);
  });

  it("toggling twice returns todos to their original state", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });
    const { id } = created.json();

    await app.inject({ method: "POST", url: "/todos/toggle-all" });
    await app.inject({ method: "POST", url: "/todos/toggle-all" });

    const getRes = await app.inject({ method: "GET", url: `/todos/${id}` });
    expect(getRes.json().completed).toBe(false);
  });
});

describe("PATCH /todos/batch — update selected todos (real app, real database)", () => {
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

  async function createMany(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/todos",
        payload: { title: `Todo ${i + 1}` },
      });
      expect(res.statusCode).toBe(201);
      ids.push(res.json().id as string);
    }
    return ids;
  }

  async function completedOf(ids: string[]): Promise<boolean[]> {
    const result: boolean[] = [];
    for (const id of ids) {
      const res = await app.inject({ method: "GET", url: `/todos/${id}` });
      expect(res.statusCode).toBe(200);
      result.push(res.json().completed as boolean);
    }
    return result;
  }

  function patchBatch(payload: unknown) {
    return app.inject({ method: "PATCH", url: "/todos/batch", payload: payload as object });
  }

  it("completes only the listed todos and returns updatedCount (16)", async () => {
    const ids = await createMany(5);
    const res = await patchBatch({ ids: [ids[1], ids[3]], completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updatedCount: 2 });
    expect(await completedOf(ids)).toEqual([false, true, false, true, false]);
  });

  it("completed false marks the listed todos active (17)", async () => {
    const ids = await createMany(3);
    await patchBatch({ ids, completed: true });
    const res = await patchBatch({ ids: [ids[0], ids[2]], completed: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updatedCount: 2 });
    expect(await completedOf(ids)).toEqual([false, true, false]);
  });

  it("leaves other todos untouched and keeps list counts correct (18)", async () => {
    const ids = await createMany(5);
    const res = await patchBatch({ ids: [ids[0], ids[1]], completed: true });
    expect(res.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/todos" });
    expect(list.json().completedCount).toBe(2);
    expect(list.json().activeCount).toBe(3);
  });

  it("todos that already have the value still count (19)", async () => {
    const ids = await createMany(3);
    await patchBatch({ ids: [ids[0]], completed: true });
    const res = await patchBatch({ ids, completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updatedCount: 3 });
  });

  it("works with one id (20)", async () => {
    const ids = await createMany(2);
    const res = await patchBatch({ ids: [ids[0]], completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updatedCount: 1 });
  });

  it("works with exactly 100 ids (21)", async () => {
    const ids = await createMany(100);
    const res = await patchBatch({ ids, completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updatedCount: 100 });
    const list = await app.inject({ method: "GET", url: "/todos" });
    expect(list.json().completedCount).toBe(100);
  }, 60_000);

  describe("validation returns 400 VALIDATION_ERROR and changes nothing (22-28)", () => {
    const cases: Array<[string, (a: string, b: string) => unknown]> = [
      ["22. empty ids", () => ({ ids: [], completed: true })],
      ["23. duplicate ids", (a) => ({ ids: [a, a], completed: true })],
      ["24. an invalid id", (a) => ({ ids: [a, "not-a-uuid"], completed: true })],
      [
        "25. 101 ids",
        () => ({ ids: Array.from({ length: 101 }, () => randomUUID()), completed: true }),
      ],
      ["26a. missing completed", (a, b) => ({ ids: [a, b] })],
      ["26b. non-boolean completed", (a, b) => ({ ids: [a, b], completed: "true" })],
      ["27. unknown field", (a) => ({ ids: [a], completed: true, status: "active" })],
      ["ids is not an array", (a) => ({ ids: a, completed: true })],
    ];

    for (const [name, build] of cases) {
      it(name, async () => {
        const [a, b] = await createMany(2);
        const res = await patchBatch(build(a!, b!));
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION_ERROR");
        // Without the batch route, /todos/:id answers "id: Invalid uuid". The batch route must not.
        expect(res.json().message).not.toMatch(/^id:/);
        expect(await completedOf([a!, b!])).toEqual([false, false]);
      });
    }

    it("28a. a request with no body returns 400", async () => {
      const res = await app.inject({ method: "PATCH", url: "/todos/batch" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("VALIDATION_ERROR");
      expect(res.json().message).not.toMatch(/^id:/);
    });

    it("28b. unreadable JSON returns 400 and changes nothing", async () => {
      const [a] = await createMany(1);
      const res = await app.inject({
        method: "PATCH",
        url: "/todos/batch",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).not.toMatch(/^id:/);
      expect(await completedOf([a!])).toEqual([false]);
    });
  });

  describe("missing ids return 409 batch_conflict and change nothing (29-32)", () => {
    it("29. one missing id", async () => {
      const [a, b] = await createMany(2);
      const missing = randomUUID();
      const res = await patchBatch({ ids: [a, missing, b], completed: true });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("batch_conflict");
      expect(res.json().missingIds).toEqual([missing]);
      expect(await completedOf([a!, b!])).toEqual([false, false]);
    });

    it("30. all ids missing", async () => {
      const missing = [randomUUID(), randomUUID()];
      const res = await patchBatch({ ids: missing, completed: true });
      expect(res.statusCode).toBe(409);
      expect(res.json().missingIds).toEqual(missing);
    });

    it("31. lists only the missing ids, in the order requested", async () => {
      const [a, b] = await createMany(2);
      const m1 = randomUUID();
      const m2 = randomUUID();
      const res = await patchBatch({ ids: [m1, a, m2, b], completed: true });
      expect(res.statusCode).toBe(409);
      expect(res.json().missingIds).toEqual([m1, m2]);
    });

    it("32. a todo deleted just before the request is a conflict", async () => {
      const [a, b] = await createMany(2);
      const del = await app.inject({ method: "DELETE", url: `/todos/${b}` });
      expect(del.statusCode).toBe(204);
      const res = await patchBatch({ ids: [a, b], completed: true });
      expect(res.statusCode).toBe(409);
      expect(res.json().missingIds).toEqual([b]);
      expect(await completedOf([a!])).toEqual([false]);
    });
  });

  it("route order: /todos/batch runs the batch handler, not /todos/:id (33)", async () => {
    const [a] = await createMany(1);
    const res = await patchBatch({ ids: [a], completed: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updatedCount: 1 });
  });

  describe("existing routes are unchanged (34)", () => {
    it("PATCH /todos/:id still works", async () => {
      const [a] = await createMany(1);
      const res = await app.inject({
        method: "PATCH",
        url: `/todos/${a}`,
        payload: { completed: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().completed).toBe(true);
    });

    it("PATCH /todos/not-a-valid-id still returns 400", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/todos/not-a-valid-id",
        payload: { completed: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("VALIDATION_ERROR");
    });

    it("PATCH /todos still sets all and refuses an ids field", async () => {
      await createMany(2);
      const good = await app.inject({
        method: "PATCH",
        url: "/todos",
        payload: { completed: true },
      });
      expect(good.statusCode).toBe(200);
      expect(good.json()).toEqual({ updatedCount: 2 });
      const bad = await app.inject({
        method: "PATCH",
        url: "/todos",
        payload: { completed: true, ids: [randomUUID()] },
      });
      expect(bad.statusCode).toBe(400);
    });

    it("POST /todos/toggle-all still works", async () => {
      await createMany(2);
      const res = await app.inject({ method: "POST", url: "/todos/toggle-all" });
      expect(res.statusCode).toBe(204);
    });
  });

  it("error bodies never contain a stack trace or SQL (35)", async () => {
    const [a] = await createMany(1);
    const bad = await patchBatch({ ids: [], completed: true });
    const conflict = await patchBatch({ ids: [a, randomUUID()], completed: true });
    expect(conflict.statusCode).toBe(409);
    for (const res of [bad, conflict]) {
      expect(res.body).not.toMatch(/stack|node_modules|select |insert |update "todos"/i);
    }
  });
});

afterAll(async () => {
  await db.$client.end();
});
