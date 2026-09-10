import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { ResultAsync, ok, err } from "neverthrow";
import { todoRoutes } from "./todo.route.js";
import { TodoErrors } from "./todo.errors.js";

import type { TodoService } from "./todo.service.js";
import type { Todo, TodoListResponse } from "contracts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Buy milk",
    completed: false,
    createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

function makeTodoListResponse(overrides: Partial<TodoListResponse> = {}): TodoListResponse {
  return {
    todos: [makeTodo()],
    activeCount: 1,
    completedCount: 0,
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
    ...overrides,
  };
}

function makeService(overrides = {}) {
  return {
    listTodos: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeTodoListResponse()))),
    getTodo: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeTodo()))),
    createTodo: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeTodo()))),
    updateTodo: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeTodo()))),
    deleteTodo: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined))),
    toggleAll: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined))),
    clearCompleted: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined))),
    ...overrides,
  };
}
async function buildApp(serviceOverrides = {}) {
  const fastify = Fastify();
  const service = makeService(serviceOverrides);
  await todoRoutes(fastify, { todoService: service as unknown as TodoService });
  return { fastify, service };
}

// ─── GET /todos ───────────────────────────────────────────────────────────────

describe("GET /todos", () => {
  it("returns 200 with todo list", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "GET", url: "/todos" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.todos).toHaveLength(1);
    expect(body.activeCount).toBe(1);
    expect(body.completedCount).toBe(0);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.totalItems).toBe(1);
    expect(body.totalPages).toBe(1);
  });

  it("filters by active", async () => {
    const { fastify, service } = await buildApp();
    await fastify.inject({ method: "GET", url: "/todos?status=active" });

    expect(service.listTodos).toHaveBeenCalledWith("active", undefined, 1, 20);
  });

  it("filters by completed", async () => {
    const { fastify, service } = await buildApp();
    await fastify.inject({ method: "GET", url: "/todos?status=completed" });

    expect(service.listTodos).toHaveBeenCalledWith("completed", undefined, 1, 20);
  });

  it("passes page and pageSize from query", async () => {
    const { fastify, service } = await buildApp();
    await fastify.inject({ method: "GET", url: "/todos?page=2&pageSize=5" });

    expect(service.listTodos).toHaveBeenCalledWith("all", undefined, 2, 5);
  });

  it("returns 400 for invalid filter", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "GET", url: "/todos?status=invalid" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid page", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "GET", url: "/todos?page=0" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for pageSize over max", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "GET", url: "/todos?pageSize=101" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 503 when service returns db error", async () => {
    const { fastify } = await buildApp({
      listTodos: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({ method: "GET", url: "/todos" });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("SERVICE_UNAVAILABLE");
  });
});

// ─── GET /todos/:id ───────────────────────────────────────────────────────────

describe("GET /todos/:id", () => {
  const validId = "00000000-0000-0000-0000-000000000001";

  it("returns 200 with the todo", async () => {
    const todo = makeTodo({ title: "Buy milk" });
    const { fastify } = await buildApp({
      getTodo: vi.fn(() => Promise.resolve(ok(todo))),
    });
    const res = await fastify.inject({ method: "GET", url: `/todos/${validId}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Buy milk");
  });

  it("returns 400 for invalid uuid", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "GET", url: "/todos/not-a-uuid" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when todo not found", async () => {
    const { fastify } = await buildApp({
      getTodo: vi.fn(() => Promise.resolve(err(TodoErrors.notFound(validId)))),
    });
    const res = await fastify.inject({ method: "GET", url: `/todos/${validId}` });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns 503 on db error", async () => {
    const { fastify } = await buildApp({
      getTodo: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({ method: "GET", url: `/todos/${validId}` });

    expect(res.statusCode).toBe(503);
  });
});

// ─── POST /todos ──────────────────────────────────────────────────────────────

describe("POST /todos", () => {
  it("returns 201 with created todo", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe("Buy milk");
  });

  it("returns 400 when title is missing", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "POST",
      url: "/todos",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when title is empty string", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when service returns empty title error", async () => {
    const { fastify } = await buildApp({
      createTodo: vi.fn(() => Promise.resolve(err(TodoErrors.emptyTitle()))),
    });
    const res = await fastify.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "something" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 503 when service returns db error", async () => {
    const { fastify } = await buildApp({
      createTodo: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({
      method: "POST",
      url: "/todos",
      payload: { title: "Buy milk" },
    });

    expect(res.statusCode).toBe(503);
  });
});

// ─── PATCH /todos/:id ─────────────────────────────────────────────────────────

describe("PATCH /todos/:id", () => {
  const validId = "00000000-0000-0000-0000-000000000001";

  it("returns 200 with updated todo when only title is sent", async () => {
    const todo = makeTodo({ title: "Buy eggs" });
    const { fastify, service } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(ok(todo))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "Buy eggs" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Buy eggs");
    // Only the sent field should reach the service — proves PATCH doesn't
    // synthesize a full replacement payload the way PUT would.
    expect(service.updateTodo).toHaveBeenCalledWith(validId, { title: "Buy eggs" });
  });

  it("returns 200 with updated todo when only completed is sent", async () => {
    const todo = makeTodo({ completed: true });
    const { fastify, service } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(ok(todo))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { completed: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().completed).toBe(true);
    expect(service.updateTodo).toHaveBeenCalledWith(validId, { completed: true });
  });

  it("returns 200 with updated todo when title and completed are both sent", async () => {
    const todo = makeTodo({ title: "Buy eggs", completed: true });
    const { fastify, service } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(ok(todo))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "Buy eggs", completed: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: "Buy eggs", completed: true });
    expect(service.updateTodo).toHaveBeenCalledWith(validId, {
      title: "Buy eggs",
      completed: true,
    });
  });

  it("returns 400 for invalid uuid", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: "/todos/not-a-uuid",
      payload: { title: "Buy eggs" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when title is empty string", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for an empty object body", async () => {
    const { fastify, service } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
    // Must fail before reaching the service — an empty patch is never a valid intent.
    expect(service.updateTodo).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown fields", async () => {
    const { fastify, service } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { archived: true },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
    expect(service.updateTodo).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown fields even alongside a valid field", async () => {
    const { fastify, service } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "Buy eggs", archived: true },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
    expect(service.updateTodo).not.toHaveBeenCalled();
  });

  it("returns 404 when todo not found", async () => {
    const { fastify } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(err(TodoErrors.notFound(validId)))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "Buy eggs" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns 503 on db error", async () => {
    const { fastify } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "Buy eggs" },
    });

    expect(res.statusCode).toBe(503);
  });
});
