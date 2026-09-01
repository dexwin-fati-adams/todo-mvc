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

// findAll now runs two queries: an items query (select -> from -> where ->
// orderBy -> limit -> offset) and a count query (select -> from -> where).
// This helper mocks db.select so the first call returns the items query
// chain, and the second call returns the count query chain.
function makeFindAllDb(items: TodoDbRow[], totalCount: number): Db {
  const itemsChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(items),
          }),
        }),
      }),
    }),
  };

  const countChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ value: totalCount }]),
    }),
  };

  const select = vi.fn().mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);

  return { select } as unknown as Db;
}

// ─── findAll ──────────────────────────────────────────────────────────────────

describe("findAll", () => {
  it('returns all todos when filter is "all" and no search is given', async () => {
    const rows = [makeRow({ id: "1" }), makeRow({ id: "2", completed: true })];
    const db = makeFindAllDb(rows, 2);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", undefined, 1, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(2);
    expect(result._unsafeUnwrap().totalItems).toBe(2);
  });

  it("filters active todos", async () => {
    const rows = [makeRow({ completed: false })];
    const db = makeFindAllDb(rows, 1);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("active", undefined, 1, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(1);
    expect(result._unsafeUnwrap().totalItems).toBe(1);
  });

  it("filters completed todos", async () => {
    const rows = [makeRow({ completed: true })];
    const db = makeFindAllDb(rows, 1);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("completed", undefined, 1, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(1);
    expect(result._unsafeUnwrap().totalItems).toBe(1);
  });

  it("matches a case-insensitive title substring when search is given", async () => {
    const rows = [makeRow({ title: "Buy milk" })];
    const db = makeFindAllDb(rows, 1);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", "MILK", 1, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(1);
    expect(result._unsafeUnwrap().items[0]?.title).toBe("Buy milk");
  });

  it("combines status and search with AND", async () => {
    const rows = [makeRow({ title: "Buy milk", completed: false })];
    const db = makeFindAllDb(rows, 1);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("active", "milk", 1, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(1);
  });

  it("returns an empty array when no rows match the search", async () => {
    const db = makeFindAllDb([], 0);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", "nonexistent", 1, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(0);
    expect(result._unsafeUnwrap().totalItems).toBe(0);
  });

  it("returns totalItems based on the full matching set, not just the page size", async () => {
    // Page 1 with pageSize 2 returns only 2 items, but 5 todos match in total.
    const rows = [makeRow({ id: "1" }), makeRow({ id: "2" })];
    const db = makeFindAllDb(rows, 5);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", undefined, 1, 2);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(2);
    expect(result._unsafeUnwrap().totalItems).toBe(5);
  });

  it("returns an empty items list for a page beyond the last real page, with totalItems still correct", async () => {
    // Only 3 todos exist, but page 5 is requested.
    const db = makeFindAllDb([], 3);

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", undefined, 5, 20);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().items).toHaveLength(0);
    expect(result._unsafeUnwrap().totalItems).toBe(3);
  });

  it("applies limit and offset based on page and pageSize", async () => {
    const rows = [makeRow({ id: "3" })];
    const limit = vi.fn().mockReturnValue({
      offset: vi.fn().mockResolvedValue(rows),
    });
    const itemsChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit }),
        }),
      }),
    };
    const countChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 21 }]),
      }),
    };
    const select = vi.fn().mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);
    const db = { select } as unknown as Db;

    const repo = createTodoRepository(db);
    // page 3, pageSize 5 → offset should be (3 - 1) * 5 = 10
    await repo.findAll("all", undefined, 3, 5);

    expect(limit).toHaveBeenCalledWith(5);
    expect(limit.mock.results[0]?.value.offset).toHaveBeenCalledWith(10);
  });

  it("returns TODO_DB_ERROR when the items query throws", async () => {
    const itemsChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockRejectedValue(new Error("db down")),
            }),
          }),
        }),
      }),
    };
    const countChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 0 }]),
      }),
    };
    const select = vi.fn().mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);
    const db = { select } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", undefined, 1, 20);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
  });

  it("returns TODO_DB_ERROR when the count query throws", async () => {
    const itemsChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };
    const countChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("count failed")),
      }),
    };
    const select = vi.fn().mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);
    const db = { select } as unknown as Db;

    const repo = createTodoRepository(db);
    const result = await repo.findAll("all", undefined, 1, 20);

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
