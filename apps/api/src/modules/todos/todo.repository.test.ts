import { describe, it, expect, vi } from "vitest";
import { createTodoRepository } from "./todo.repository.js";
import type { TodoDbRow } from "@/lib/schema.js";
import type { Db } from "@/lib/db.js";

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

// ─── findAll ──────────────────────────────────────────────────────────────────

describe("findAll", () => {
  it('returns all todos when filter is "all"', async () => {
    const rows = [makeRow({ id: "1" }), makeRow({ id: "2", completed: true })];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(rows),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(2);
  });

  it("filters active todos", async () => {
    const rows = [makeRow({ completed: false })];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.findAll("active");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(1);
  });

  it("filters completed todos", async () => {
    const rows = [makeRow({ completed: true })];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.findAll("completed");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(1);
  });

  it("returns TODO_DB_ERROR when db throws", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error("db down")),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });
});

// ─── insert ───────────────────────────────────────────────────────────────────

describe("insert", () => {
  it("inserts and returns the row", async () => {
    const row = makeRow({ title: "Write tests" });
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([row]),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.insert(row);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().title).toBe("Write tests");
  });

  it("returns TODO_DB_ERROR when insert fails", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("insert failed")),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.insert(makeRow());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe("update", () => {
  it("updates and returns the updated row", async () => {
    const updated = makeRow({ title: "Updated title" });
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as unknown as Db;
    const repo = createTodoRepository(db);
    const result = await repo.update("1", { title: "Updated title" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().title).toBe("Updated title");
  });

  it("returns TODO_NOT_FOUND when no rows returned", async () => {
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.update("99", { title: "Ghost" });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_NOT_FOUND");
  });

  it("returns TODO_DB_ERROR when update throws", async () => {
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error("update failed")),
          }),
        }),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.update("1", { completed: true });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("delete", () => {
  it("deletes a todo and returns void", async () => {
    const db = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.delete("1");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it("returns TODO_DB_ERROR when delete throws", async () => {
    const db = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("delete failed")),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.delete("1");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });
});

// ─── updateAllCompleted ───────────────────────────────────────────────────────

describe("updateAllCompleted", () => {
  it("marks all todos as completed", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      update: vi.fn().mockReturnValue({ set }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.updateAllCompleted(true);

    expect(result.isOk()).toBe(true);
    expect(set).toHaveBeenCalledWith({ completed: true });
  });
  it("returns TODO_DB_ERROR when it throws", async () => {
    const db = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockRejectedValue(new Error("failed")),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.updateAllCompleted(false);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });
});

// ─── deleteAllCompleted ───────────────────────────────────────────────────────

describe("deleteAllCompleted", () => {
  it("deletes all completed todos", async () => {
    const db = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as Db;
    const repo = createTodoRepository(db);
    const result = await repo.deleteAllCompleted();

    expect(result.isOk()).toBe(true);
  });

  it("returns TODO_DB_ERROR when it throws", async () => {
    const db = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("failed")),
      }),
    } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.deleteAllCompleted();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });
});
