import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { ResultAsync, ok, err } from "neverthrow";
import { todoRoutes } from "./todo.route.js";
import { TodoErrors } from "./todo.errors.js";

import type { TodoService } from "./todo.service.js";
import { Todo, TodoListResponse } from "contracts/src/todos/todo.contracts.js";

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
    ...overrides,
  };
}

function makeService(overrides = {}) {
  return {
    listTodos: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeTodoListResponse()))),
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
  });

  it("filters by active", async () => {
    const { fastify, service } = await buildApp();
    await fastify.inject({ method: "GET", url: "/todos?filter=active" });

    expect(service.listTodos).toHaveBeenCalledWith("active");
  });

  it("filters by completed", async () => {
    const { fastify, service } = await buildApp();
    await fastify.inject({ method: "GET", url: "/todos?filter=completed" });

    expect(service.listTodos).toHaveBeenCalledWith("completed");
  });

  it("returns 400 for invalid filter", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "GET", url: "/todos?filter=invalid" });

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

  it("returns 200 with updated todo", async () => {
    const updated = makeTodo({ title: "Updated" });
    const { fastify } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(ok(updated))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "Updated" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Updated");
  });

  it("returns 400 for invalid uuid", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: "/todos/not-a-uuid",
      payload: { title: "Updated" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for empty title", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { title: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when todo not found", async () => {
    const { fastify } = await buildApp({
      updateTodo: vi.fn(() => Promise.resolve(err(TodoErrors.notFound(validId)))),
    });
    const res = await fastify.inject({
      method: "PATCH",
      url: `/todos/${validId}`,
      payload: { completed: true },
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
      payload: { completed: true },
    });

    expect(res.statusCode).toBe(503);
  });
});

// ─── DELETE /todos/:id ────────────────────────────────────────────────────────

describe("DELETE /todos/:id", () => {
  const validId = "00000000-0000-0000-0000-000000000001";

  it("returns 204 on success", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "DELETE",
      url: `/todos/${validId}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it("returns 400 for invalid uuid", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({
      method: "DELETE",
      url: "/todos/not-a-uuid",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when todo not found", async () => {
    const { fastify } = await buildApp({
      deleteTodo: vi.fn(() => Promise.resolve(err(TodoErrors.notFound(validId)))),
    });
    const res = await fastify.inject({
      method: "DELETE",
      url: `/todos/${validId}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns 503 on db error", async () => {
    const { fastify } = await buildApp({
      deleteTodo: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({
      method: "DELETE",
      url: `/todos/${validId}`,
    });

    expect(res.statusCode).toBe(503);
  });
});

// ─── POST /todos/toggle-all ───────────────────────────────────────────────────

describe("POST /todos/toggle-all", () => {
  it("returns 204 on success", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "POST", url: "/todos/toggle-all" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 503 on db error", async () => {
    const { fastify } = await buildApp({
      toggleAll: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({ method: "POST", url: "/todos/toggle-all" });

    expect(res.statusCode).toBe(503);
  });
});

// ─── DELETE /todos/completed ──────────────────────────────────────────────────

describe("DELETE /todos/completed", () => {
  it("returns 204 on success", async () => {
    const { fastify } = await buildApp();
    const res = await fastify.inject({ method: "DELETE", url: "/todos/completed" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 503 on db error", async () => {
    const { fastify } = await buildApp({
      clearCompleted: vi.fn(() => Promise.resolve(err(TodoErrors.dbError(new Error("db down"))))),
    });
    const res = await fastify.inject({ method: "DELETE", url: "/todos/completed" });

    expect(res.statusCode).toBe(503);
  });
});
