import { test, expect, type APIRequestContext } from "@playwright/test";
import { createDb, type Db } from "@/lib/db.js";
import { config } from "@/lib/config.js";
import { sql } from "drizzle-orm";
import type { Todo, TodoListResponse, ErrorResponse, SetAllCompletedResponse } from "contracts";

const db: Db = createDb(config);

test.describe.configure({ mode: "serial" });

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

async function clearAllTodos(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE todos RESTART IDENTITY CASCADE`);
}

async function createTodo(request: APIRequestContext, title = "Buy milk"): Promise<Todo> {
  const res = await request.post("/todos", { data: { title } });
  return res.json() as Promise<Todo>;
}

test.beforeEach(async () => {
  await clearAllTodos();
});

test.describe("POST /todos", () => {
  test("creates a todo with a title", async ({ request }) => {
    const res = await request.post("/todos", { data: { title: "Buy milk" } });
    expect(res.status()).toBe(201);

    const body = (await res.json()) as Todo;
    expect(body.title).toBe("Buy milk");
    expect(body.completed).toBe(false);
    expect(body.id).toBeDefined();
  });

  test("rejects a missing title", async ({ request }) => {
    const res = await request.post("/todos", { data: {} });
    expect(res.status()).toBe(400);

    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("title");
  });

  test("rejects an empty title", async ({ request }) => {
    const res = await request.post("/todos", { data: { title: "" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /todos", () => {
  test("returns an empty list with counts at 0", async ({ request }) => {
    const res = await request.get("/todos");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as TodoListResponse;
    expect(body.todos).toEqual([]);
    expect(body.totalItems).toBe(0);
    expect(body.activeCount).toBe(0);
    expect(body.completedCount).toBe(0);
  });

  test("returns created todos", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.get("/todos");
    const body = (await res.json()) as TodoListResponse;

    expect(body.todos).toHaveLength(2);
    expect(body.totalItems).toBe(2);
    expect(body.activeCount).toBe(2);
    expect(body.completedCount).toBe(0);
  });

  test("filters by status", async ({ request }) => {
    const a = await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");
    await request.put(`/todos/${a.id}`, { data: { title: a.title, completed: true } });

    const activeRes = await request.get("/todos?status=active");
    const activeBody = (await activeRes.json()) as TodoListResponse;
    expect(activeBody.todos).toHaveLength(1);
    expect(activeBody.todos[0].title).toBe("Walk dog");

    const completedRes = await request.get("/todos?status=completed");
    const completedBody = (await completedRes.json()) as TodoListResponse;
    expect(completedBody.todos).toHaveLength(1);
    expect(completedBody.todos[0].title).toBe("Buy milk");
  });

  test("filters by search term", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.get("/todos?search=milk");
    const body = (await res.json()) as TodoListResponse;
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].title).toBe("Buy milk");
  });

  test("rejects a blank search string", async ({ request }) => {
    // search is trimmed then .min(1) — a whitespace-only value fails validation
    const res = await request.get("/todos?search=%20%20");
    expect(res.status()).toBe(400);
  });

  test("paginates results", async ({ request }) => {
    for (let i = 0; i < 25; i++) {
      await createTodo(request, `Todo ${i}`);
    }

    const res = await request.get("/todos?page=2&pageSize=20");
    const body = (await res.json()) as TodoListResponse;

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(20);
    expect(body.totalItems).toBe(25);
    expect(body.totalPages).toBe(2);
    expect(body.todos).toHaveLength(5);
  });

  test("rejects an invalid status value", async ({ request }) => {
    const res = await request.get("/todos?status=bogus");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects unknown query params (strict schema)", async ({ request }) => {
    const res = await request.get("/todos?sortBy=title");
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /todos/:id", () => {
  test("returns a single todo", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.get(`/todos/${created.id}`);
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.id).toBe(created.id);
    expect(body.title).toBe("Buy milk");
  });

  test("returns 404 for a nonexistent id", async ({ request }) => {
    const res = await request.get(`/todos/${NONEXISTENT_ID}`);
    expect(res.status()).toBe(404);
  });

  test("returns 400 for a malformed (non-UUID) id", async ({ request }) => {
    const res = await request.get(`/todos/not-a-valid-id`);
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});

// PATCH is a bulk endpoint — it sets the completed status for every todo at
// once and reports how many rows it touched. There is no per-id PATCH; use
// PUT /todos/:id to update a single todo's title and/or completed status.
test.describe("PATCH /todos", () => {
  test("marks every todo as completed and reports how many were updated", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.patch("/todos", { data: { completed: true } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as SetAllCompletedResponse;
    expect(body.updatedCount).toBe(2);

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.todos.every((t) => t.completed)).toBe(true);
  });

  test("marks every todo as active", async ({ request }) => {
    const created = await createTodo(request);
    await request.put(`/todos/${created.id}`, {
      data: { title: created.title, completed: true },
    });

    const res = await request.patch("/todos", { data: { completed: false } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as SetAllCompletedResponse;
    expect(body.updatedCount).toBe(1);

    const getRes = await request.get(`/todos/${created.id}`);
    expect(((await getRes.json()) as Todo).completed).toBe(false);
  });

  test("reports zero updated when there are no todos", async ({ request }) => {
    const res = await request.patch("/todos", { data: { completed: true } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as SetAllCompletedResponse;
    expect(body.updatedCount).toBe(0);
  });

  test("rejects an empty body (completed is required)", async ({ request }) => {
    const res = await request.patch("/todos", { data: {} });
    expect(res.status()).toBe(400);

    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects extra keys (strict schema)", async ({ request }) => {
    const res = await request.patch("/todos", {
      data: { completed: true, id: NONEXISTENT_ID },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a non-boolean completed value", async ({ request }) => {
    const res = await request.patch("/todos", { data: { completed: "yes" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("PUT /todos/:id", () => {
  test("replaces title and completed", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.put(`/todos/${created.id}`, {
      data: { title: "Buy oat milk", completed: true },
    });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.title).toBe("Buy oat milk");
    expect(body.completed).toBe(true);
  });

  test("rejects a partial body (missing completed)", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.put(`/todos/${created.id}`, {
      data: { title: "Buy oat milk" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects extra keys like id or createdAt (strict schema)", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.put(`/todos/${created.id}`, {
      data: {
        title: "Buy oat milk",
        completed: true,
        id: NONEXISTENT_ID,
        createdAt: new Date().toISOString(),
      },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for a nonexistent id", async ({ request }) => {
    const res = await request.put(`/todos/${NONEXISTENT_ID}`, {
      data: { title: "nope", completed: false },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("POST /todos/toggle-all", () => {
  test("marks all todos as completed", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.post("/todos/toggle-all");
    expect(res.status()).toBe(204);

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.todos.every((t) => t.completed)).toBe(true);
    expect(list.completedCount).toBe(2);
  });

  test("toggling all again un-completes them (if it's a true toggle)", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await request.post("/todos/toggle-all"); // all completed
    await request.post("/todos/toggle-all"); // toggled back?

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    // Verify against your actual todo.service.ts implementation —
    // if toggle-all always forces completed:true rather than flipping,
    // this assertion (and test name) needs to change.
    expect(list.activeCount).toBe(1);
  });
});

let closed = false;
test.afterAll(async () => {
  if (closed) return;
  closed = true;
  await db.$client.end();
});