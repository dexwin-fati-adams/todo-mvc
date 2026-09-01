// import { describe, it, expect, vi } from "vitest";
// import { ResultAsync } from "neverthrow";
// import { createTodoService } from "./todo.service.js";
// import { TodoErrors } from "./todo.errors.js";
// import type { TodoRepository, FindAllResult } from "./todo.repository.js";
// import type { TodoDbRow } from "@/lib/schema.js";

// // ─── Helpers ──────────────────────────────────────────────────────────────────

// function makeRow(overrides: Partial<TodoDbRow> = {}): TodoDbRow {
//   return {
//     id: "00000000-0000-0000-0000-000000000001",
//     title: "Buy milk",
//     completed: false,
//     createdAt: new Date("2024-01-01T00:00:00Z"),
//     ...overrides,
//   };
// }

// function makeFindAllResult(items: TodoDbRow[] = [], totalItems = items.length): FindAllResult {
//   return { items, totalItems };
// }

// function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
//   const repo: TodoRepository = {
//     withTransaction: vi.fn(() => repo),
//     findAll: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult()))),
//     insert: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeRow()))),
//     update: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeRow()))),
//     delete: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined))),
//     updateAllCompleted: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined))),
//     deleteAllCompleted: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined))),
//     ...overrides,
//   };
//   return repo;
// }

// // ─── createTodo ───────────────────────────────────────────────────────────────

// describe("createTodo", () => {
//   it("inserts a todo with trimmed title and returns it", async () => {
//     const row = makeRow({ title: "Buy milk" });
//     const repo = makeRepo({
//       insert: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(row))),
//     });
//     const service = createTodoService(repo);

//     const result = await service.createTodo("  Buy milk  ");

//     expect(result.isOk()).toBe(true);
//     expect(result._unsafeUnwrap().title).toBe("Buy milk");
//     expect(repo.insert).toHaveBeenCalledOnce();
//   });

//   it("returns TODO_EMPTY_TITLE when title is blank", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     const result = await service.createTodo("   ");

//     expect(result.isErr()).toBe(true);
//     expect(result._unsafeUnwrapErr().type).toBe("TODO_EMPTY_TITLE");
//     expect(repo.insert).not.toHaveBeenCalled();
//   });
// });

// // ─── listTodos ────────────────────────────────────────────────────────────────

// describe("listTodos", () => {
//   it("returns todos with correct active and completed counts", async () => {
//     const allRows = [
//       makeRow({ id: "1", completed: false }),
//       makeRow({ id: "2", completed: true }),
//       makeRow({ id: "3", completed: false }),
//     ];
//     const repo = makeRepo({
//       findAll: vi.fn(() =>
//         ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult(allRows))),
//       ),
//     });
//     const service = createTodoService(repo);

//     const result = await service.listTodos("all", undefined, 1, 20);

//     expect(result.isOk()).toBe(true);
//     const data = result._unsafeUnwrap();
//     expect(data.todos).toHaveLength(3);
//     expect(data.activeCount).toBe(2);
//     expect(data.completedCount).toBe(1);
//   });

//   it("delegates status, search, page, and pageSize to repository", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     await service.listTodos("active", "milk", 2, 10);

//     // First call is the unfiltered "all" call used for the footer counts.
//     expect(repo.findAll).toHaveBeenNthCalledWith(1, "all", undefined, 1, Number.MAX_SAFE_INTEGER);
//     // Second call is the real, filtered, paginated call.
//     expect(repo.findAll).toHaveBeenNthCalledWith(2, "active", "milk", 2, 10);
//   });

//   it("returns page, pageSize, totalItems, and totalPages from the filtered result", async () => {
//     const pageRows = [makeRow({ id: "1" }), makeRow({ id: "2" })];
//     const repo = makeRepo({
//       findAll: vi
//         .fn()
//         .mockReturnValueOnce(ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult([], 0))))
//         .mockReturnValueOnce(
//           ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult(pageRows, 9))),
//         ),
//     });
//     const service = createTodoService(repo);

//     const result = await service.listTodos("all", undefined, 2, 4);

//     expect(result.isOk()).toBe(true);
//     const data = result._unsafeUnwrap();
//     expect(data.page).toBe(2);
//     expect(data.pageSize).toBe(4);
//     expect(data.totalItems).toBe(9);
//     expect(data.totalPages).toBe(3); // Math.ceil(9 / 4)
//   });

//   it("returns totalPages of 0 when there are no matching items", async () => {
//     const repo = makeRepo({
//       findAll: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult([], 0)))),
//     });
//     const service = createTodoService(repo);

//     const result = await service.listTodos("all", undefined, 1, 20);

//     expect(result.isOk()).toBe(true);
//     const data = result._unsafeUnwrap();
//     expect(data.totalItems).toBe(0);
//     expect(data.totalPages).toBe(0);
//   });

//   it("returns an empty todos list for a page beyond the last real page", async () => {
//     const repo = makeRepo({
//       findAll: vi
//         .fn()
//         .mockReturnValueOnce(ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult([], 0))))
//         .mockReturnValueOnce(
//           ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult([], 3))),
//         ),
//     });
//     const service = createTodoService(repo);

//     const result = await service.listTodos("all", undefined, 99, 20);

//     expect(result.isOk()).toBe(true);
//     const data = result._unsafeUnwrap();
//     expect(data.todos).toHaveLength(0);
//     expect(data.totalItems).toBe(3);
//     expect(data.totalPages).toBe(1);
//   });
// });

// // ─── updateTodo ───────────────────────────────────────────────────────────────

// describe("updateTodo", () => {
//   it("trims title before updating", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     await service.updateTodo("1", { title: "  Trimmed  " });

//     expect(repo.update).toHaveBeenCalledWith("1", { title: "Trimmed" });
//   });

//   it("returns TODO_EMPTY_TITLE when new title is blank", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     const result = await service.updateTodo("1", { title: "   " });

//     expect(result.isErr()).toBe(true);
//     expect(result._unsafeUnwrapErr().type).toBe("TODO_EMPTY_TITLE");
//     expect(repo.update).not.toHaveBeenCalled();
//   });

//   it("updates completed flag without touching title", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     await service.updateTodo("1", { completed: true });

//     expect(repo.update).toHaveBeenCalledWith("1", { completed: true });
//   });

//   it("propagates TODO_NOT_FOUND from repository", async () => {
//     const repo = makeRepo({
//       update: vi.fn(() =>
//         ResultAsync.fromPromise(Promise.reject(new Error("x")), () => TodoErrors.notFound("99")),
//       ),
//     });
//     const service = createTodoService(repo);

//     const result = await service.updateTodo("99", { completed: true });

//     expect(result._unsafeUnwrapErr().type).toBe("TODO_NOT_FOUND");
//   });
// });

// // ─── deleteTodo ───────────────────────────────────────────────────────────────

// describe("deleteTodo", () => {
//   it("delegates to repository delete", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     await service.deleteTodo("abc");

//     expect(repo.delete).toHaveBeenCalledWith("abc");
//   });
// });

// // ─── toggleAll ────────────────────────────────────────────────────────────────

// describe("toggleAll", () => {
//   it("marks all complete when any are active", async () => {
//     const rows = [makeRow({ completed: false }), makeRow({ completed: true })];
//     const repo = makeRepo({
//       findAll: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult(rows)))),
//     });
//     const service = createTodoService(repo);

//     await service.toggleAll();

//     expect(repo.updateAllCompleted).toHaveBeenCalledWith(true);
//   });

//   it("marks all active when all are completed", async () => {
//     const rows = [makeRow({ completed: true }), makeRow({ completed: true })];
//     const repo = makeRepo({
//       findAll: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(makeFindAllResult(rows)))),
//     });
//     const service = createTodoService(repo);

//     await service.toggleAll();

//     expect(repo.updateAllCompleted).toHaveBeenCalledWith(false);
//   });

//   it("propagates db error from findAll", async () => {
//     const repo = makeRepo({
//       findAll: vi.fn(() =>
//         ResultAsync.fromPromise(Promise.reject(new Error("down")), () =>
//           TodoErrors.dbError(new Error("down")),
//         ),
//       ),
//     });
//     const service = createTodoService(repo);

//     const result = await service.toggleAll();

//     expect(result.isErr()).toBe(true);
//     expect(result._unsafeUnwrapErr().type).toBe("TODO_DB_ERROR");
//     expect(repo.updateAllCompleted).not.toHaveBeenCalled();
//   });
// });

// // ─── clearCompleted ───────────────────────────────────────────────────────────

// describe("clearCompleted", () => {
//   it("delegates to repository deleteAllCompleted", async () => {
//     const repo = makeRepo();
//     const service = createTodoService(repo);

//     await service.clearCompleted();

//     expect(repo.deleteAllCompleted).toHaveBeenCalledOnce();
//   });
// });
