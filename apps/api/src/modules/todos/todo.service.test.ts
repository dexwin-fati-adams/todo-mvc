import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTodoService } from "./todo.service.js";
import { TodoErrors } from "./todo.errors.js";
import type { TodoRepository } from "./todo.repository.js";
import type { TodoDbRow } from "@/lib/schema.js";
import { okAsync, errAsync } from "neverthrow";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<TodoDbRow> = {}): TodoDbRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Buy milk",
    completed: false,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeMockRepository(): TodoRepository {
  return {
    withTransaction: vi.fn().mockReturnThis(),
    findAll: vi.fn(),
    findById: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateAllCompleted: vi.fn(),
    deleteAllCompleted: vi.fn(),
  };
}

// ─── createTodo ───────────────────────────────────────────────────────────────

describe("createTodo", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("creates a todo with a valid title", async () => {
    const row = makeRow({ title: "Buy milk" });
    vi.mocked(repo.insert).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    const result = await service.createTodo("  Buy milk  ");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.title).toBe("Buy milk");
      expect(result.value.completed).toBe(false);
      expect(result.value.id).toBeDefined();
      expect(result.value.createdAt).toBeDefined();
    }
  });

  it("returns EMPTY_TITLE error for empty title", async () => {
    const service = createTodoService(repo);
    const result = await service.createTodo("   ");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_EMPTY_TITLE");
    }
  });

  it("trims whitespace from the title", async () => {
    const row = makeRow({ title: "Trimmed title" });
    vi.mocked(repo.insert).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    await service.createTodo("  Trimmed title  ");

    expect(vi.mocked(repo.insert)).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Trimmed title" }),
    );
  });

  it("propagates repository errors", async () => {
    const dbError = TodoErrors.dbError(new Error("Connection failed"));
    vi.mocked(repo.insert).mockReturnValue(errAsync(dbError));

    const service = createTodoService(repo);
    const result = await service.createTodo("Buy milk");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_DB_ERROR");
    }
  });
});

// ─── getTodo ──────────────────────────────────────────────────────────────────

describe("getTodo", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("returns a todo by id", async () => {
    const row = makeRow({ id: "todo-123" });
    vi.mocked(repo.findById).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    const result = await service.getTodo("todo-123");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe("todo-123");
      expect(result.value.title).toBe("Buy milk");
      expect(result.value.createdAt).toBe(row.createdAt.toISOString());
    }
  });

  it("returns NOT_FOUND error when todo doesn't exist", async () => {
    const notFoundError = TodoErrors.notFound("nonexistent-id");
    vi.mocked(repo.findById).mockReturnValue(errAsync(notFoundError));

    const service = createTodoService(repo);
    const result = await service.getTodo("nonexistent-id");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_NOT_FOUND");
    }
  });

  it("converts createdAt to ISO string", async () => {
    const createdAt = new Date("2024-06-15T10:30:00Z");
    const row = makeRow({ createdAt });
    vi.mocked(repo.findById).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    const result = await service.getTodo("todo-123");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.createdAt).toBe(createdAt.toISOString());
    }
  });
});

// ─── listTodos ────────────────────────────────────────────────────────────────

describe("listTodos", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("returns a list of todos with pagination", async () => {
    const todos = [
      makeRow({ id: "1", title: "Task 1", completed: false }),
      makeRow({ id: "2", title: "Task 2", completed: true }),
    ];
    const allTodos = [
      makeRow({ id: "1", title: "Task 1", completed: false }),
      makeRow({ id: "2", title: "Task 2", completed: true }),
      makeRow({ id: "3", title: "Task 3", completed: true }),
    ];

    vi.mocked(repo.findAll)
      .mockReturnValueOnce(okAsync({ items: allTodos, totalItems: 3 }))
      .mockReturnValueOnce(okAsync({ items: todos, totalItems: 2 }));

    const service = createTodoService(repo);
    const result = await service.listTodos("all", undefined, 1, 2);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.todos).toHaveLength(2);
      expect(result.value.activeCount).toBe(1);
      expect(result.value.completedCount).toBe(2);
      expect(result.value.totalPages).toBe(1);
      expect(result.value.page).toBe(1);
      expect(result.value.pageSize).toBe(2);
    }
  });

  it("returns empty list with correct counts", async () => {
    vi.mocked(repo.findAll)
      .mockReturnValueOnce(okAsync({ items: [], totalItems: 0 }))
      .mockReturnValueOnce(okAsync({ items: [], totalItems: 0 }));

    const service = createTodoService(repo);
    const result = await service.listTodos("all", undefined, 1, 10);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.todos).toHaveLength(0);
      expect(result.value.activeCount).toBe(0);
      expect(result.value.completedCount).toBe(0);
      expect(result.value.totalPages).toBe(0);
    }
  });

  it("calculates total pages correctly", async () => {
    const todos = Array.from({ length: 7 }, (_, i) =>
      makeRow({ id: String(i + 1), completed: i % 2 === 0 }),
    );

    vi.mocked(repo.findAll)
      .mockReturnValueOnce(okAsync({ items: todos, totalItems: 7 }))
      .mockReturnValueOnce(okAsync({ items: todos.slice(0, 3), totalItems: 7 }));

    const service = createTodoService(repo);
    const result = await service.listTodos("all", undefined, 1, 3);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.totalPages).toBe(3);
    }
  });

  it("handles search and status filters", async () => {
    const todos = [makeRow({ id: "1", title: "Milk" })];

    vi.mocked(repo.findAll)
      .mockReturnValueOnce(okAsync({ items: todos, totalItems: 1 }))
      .mockReturnValueOnce(okAsync({ items: todos, totalItems: 1 }));

    const service = createTodoService(repo);
    await service.listTodos("active", "milk", 1, 10);

    expect(vi.mocked(repo.findAll)).toHaveBeenNthCalledWith(
      1,
      "all",
      undefined,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    expect(vi.mocked(repo.findAll)).toHaveBeenNthCalledWith(2, "active", "milk", 1, 10);
  });

  it("propagates repository errors", async () => {
    const dbError = TodoErrors.dbError(new Error("DB failed"));
    vi.mocked(repo.findAll)
      .mockReturnValueOnce(okAsync({ items: [], totalItems: 0 }))
      .mockReturnValueOnce(errAsync(dbError));

    const service = createTodoService(repo);
    const result = await service.listTodos("all", undefined, 1, 10);

    expect(result.isErr()).toBe(true);
  });
});

// ─── updateTodo ───────────────────────────────────────────────────────────────

describe("updateTodo", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("updates todo title", async () => {
    const row = makeRow({ id: "todo-1", title: "New Title" });
    vi.mocked(repo.update).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    const result = await service.updateTodo("todo-1", { title: "New Title" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.title).toBe("New Title");
    }
    expect(vi.mocked(repo.update)).toHaveBeenCalledWith("todo-1", { title: "New Title" });
  });

  it("updates todo completed status", async () => {
    const row = makeRow({ id: "todo-1", completed: true });
    vi.mocked(repo.update).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    const result = await service.updateTodo("todo-1", { completed: true });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.completed).toBe(true);
    }
    expect(vi.mocked(repo.update)).toHaveBeenCalledWith("todo-1", { completed: true });
  });

  it("updates both title and completed status", async () => {
    const row = makeRow({ id: "todo-1", title: "Updated", completed: true });
    vi.mocked(repo.update).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    const result = await service.updateTodo("todo-1", { title: "Updated", completed: true });

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(repo.update)).toHaveBeenCalledWith("todo-1", {
      title: "Updated",
      completed: true,
    });
  });

  it("trims title whitespace", async () => {
    const row = makeRow({ title: "Trimmed" });
    vi.mocked(repo.update).mockReturnValue(okAsync(row));

    const service = createTodoService(repo);
    await service.updateTodo("todo-1", { title: "  Trimmed  " });

    expect(vi.mocked(repo.update)).toHaveBeenCalledWith("todo-1", { title: "Trimmed" });
  });

  it("returns EMPTY_TITLE error for empty title", async () => {
    const service = createTodoService(repo);
    const result = await service.updateTodo("todo-1", { title: "   " });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_EMPTY_TITLE");
    }
  });

  it("propagates repository NOT_FOUND error", async () => {
    const notFoundError = TodoErrors.notFound("todo-1");
    vi.mocked(repo.update).mockReturnValue(errAsync(notFoundError));

    const service = createTodoService(repo);
    const result = await service.updateTodo("todo-1", { title: "New Title" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_NOT_FOUND");
    }
  });
});

// ─── deleteTodo ───────────────────────────────────────────────────────────────

describe("deleteTodo", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("deletes a todo by id", async () => {
    vi.mocked(repo.delete).mockReturnValue(okAsync(undefined));

    const service = createTodoService(repo);
    const result = await service.deleteTodo("todo-1");

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(repo.delete)).toHaveBeenCalledWith("todo-1");
  });

  it("propagates repository errors", async () => {
    const dbError = TodoErrors.dbError(new Error("DB error"));
    vi.mocked(repo.delete).mockReturnValue(errAsync(dbError));

    const service = createTodoService(repo);
    const result = await service.deleteTodo("todo-1");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_DB_ERROR");
    }
  });
});

// ─── toggleAll ────────────────────────────────────────────────────────────────

describe("toggleAll", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("marks all as complete when there are incomplete todos", async () => {
    const todos = [makeRow({ id: "1", completed: false }), makeRow({ id: "2", completed: true })];
    vi.mocked(repo.findAll).mockReturnValue(okAsync({ items: todos, totalItems: 2 }));
    vi.mocked(repo.updateAllCompleted).mockReturnValue(okAsync(undefined));

    const service = createTodoService(repo);
    const result = await service.toggleAll();

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(repo.updateAllCompleted)).toHaveBeenCalledWith(true);
  });

  it("marks all as incomplete when all are completed", async () => {
    const todos = [makeRow({ id: "1", completed: true }), makeRow({ id: "2", completed: true })];
    vi.mocked(repo.findAll).mockReturnValue(okAsync({ items: todos, totalItems: 2 }));
    vi.mocked(repo.updateAllCompleted).mockReturnValue(okAsync(undefined));

    const service = createTodoService(repo);
    const result = await service.toggleAll();

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(repo.updateAllCompleted)).toHaveBeenCalledWith(false);
  });

  it("does nothing when there are no todos", async () => {
    vi.mocked(repo.findAll).mockReturnValue(okAsync({ items: [], totalItems: 0 }));
    vi.mocked(repo.updateAllCompleted).mockReturnValue(okAsync(undefined));

    const service = createTodoService(repo);
    const result = await service.toggleAll();

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(repo.updateAllCompleted)).toHaveBeenCalledWith(false);
  });

  it("propagates repository errors", async () => {
    const dbError = TodoErrors.dbError(new Error("DB error"));
    vi.mocked(repo.findAll).mockReturnValue(errAsync(dbError));

    const service = createTodoService(repo);
    const result = await service.toggleAll();

    expect(result.isErr()).toBe(true);
  });
});

// ─── clearCompleted ───────────────────────────────────────────────────────────

describe("clearCompleted", () => {
  let repo: TodoRepository;

  beforeEach(() => {
    repo = makeMockRepository();
  });

  it("deletes all completed todos", async () => {
    vi.mocked(repo.deleteAllCompleted).mockReturnValue(okAsync(undefined));

    const service = createTodoService(repo);
    const result = await service.clearCompleted();

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(repo.deleteAllCompleted)).toHaveBeenCalled();
  });

  it("propagates repository errors", async () => {
    const dbError = TodoErrors.dbError(new Error("DB error"));
    vi.mocked(repo.deleteAllCompleted).mockReturnValue(errAsync(dbError));

    const service = createTodoService(repo);
    const result = await service.clearCompleted();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("TODO_DB_ERROR");
    }
  });
});
