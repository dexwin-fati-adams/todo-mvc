import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { ResultAsync, err } from "neverthrow";
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
