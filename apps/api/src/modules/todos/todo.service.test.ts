import { err, ok, errAsync } from "neverthrow";
import type { Result, ResultAsync } from "neverthrow";
import { match } from "ts-pattern";
import { v4 as uuid } from "uuid";
import type { TodoRepository } from "./todo.repository.js";
import { TodoErrors, type TodoError } from "./todo.errors.js";
import type { Todo, TodoListResponse, Status } from "contracts";
import type { TodoDbRow } from "@/lib/schema.js";

function rowToTodo(row: TodoDbRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
  };
}

type UpdatePatch = { title?: string; completed?: boolean };
type ResolvedPatch = Partial<Pick<TodoDbRow, "title" | "completed">>;
type PatchState = { type: "EMPTY_TITLE" } | { type: "VALID"; resolved: ResolvedPatch };

function resolvePatch(patch: UpdatePatch): Result<ResolvedPatch, TodoError> {
  const state: PatchState = match(patch)
    .when(
      (p) => p.title !== undefined && p.title.trim() === "",
      (): PatchState => ({ type: "EMPTY_TITLE" }),
    )
    .otherwise((p): PatchState => ({
      type: "VALID",
      resolved: {
        ...(p.title !== undefined ? { title: p.title.trim() } : {}),
        ...(p.completed !== undefined ? { completed: p.completed } : {}),
      },
    }));

  return match(state)
    .with({ type: "EMPTY_TITLE" }, () => err(TodoErrors.emptyTitle()))
    .with({ type: "VALID" }, ({ resolved }) => ok(resolved))
    .exhaustive();
}

type ToggleAllState = { type: "EMPTY" } | { type: "ALL_COMPLETED" } | { type: "HAS_INCOMPLETE" };

export interface TodoService {
  createTodo(rawTitle: string): ResultAsync<Todo, TodoError>;
  getTodo(id: string): ResultAsync<Todo, TodoError>;
  listTodos(
    status: Status,
    search: string | undefined,
    page: number,
    pageSize: number,
  ): ResultAsync<TodoListResponse, TodoError>;
  updateTodo(id: string, patch: UpdatePatch): ResultAsync<Todo, TodoError>;
  deleteTodo(id: string): ResultAsync<void, TodoError>;
  toggleAll(): ResultAsync<void, TodoError>;
  clearCompleted(): ResultAsync<void, TodoError>;
}

export function createTodoService(repo: TodoRepository): TodoService {
  return {
    createTodo(rawTitle: string): ResultAsync<Todo, TodoError> {
      const title = rawTitle.trim();
      if (title === "") {
        return errAsync(TodoErrors.emptyTitle());
      }

      const row: TodoDbRow = { id: uuid(), title, completed: false, createdAt: new Date() };
      return repo.insert(row).map(rowToTodo);
    },

    getTodo(id: string): ResultAsync<Todo, TodoError> {
      return repo.findById(id).map(rowToTodo);
    },

    listTodos(
      status: Status,
      search: string | undefined,
      page: number,
      pageSize: number,
    ): ResultAsync<TodoListResponse, TodoError> {
      // "all" with no page limits is used only to work out activeCount and
      // completedCount across every todo, ignoring the current status filter,
      // search, and page. The real page of results comes from the second,
      // filtered call.
      return repo.findAll("all", undefined, 1, Number.MAX_SAFE_INTEGER).andThen((allResult) =>
        repo.findAll(status, search, page, pageSize).map((filteredResult) => {
          const totalPages =
            filteredResult.totalItems === 0 ? 0 : Math.ceil(filteredResult.totalItems / pageSize);

          return {
            todos: filteredResult.items.map(rowToTodo),
            activeCount: allResult.items.filter((r) => !r.completed).length,
            completedCount: allResult.items.filter((r) => r.completed).length,
            page,
            pageSize,
            totalItems: filteredResult.totalItems,
            totalPages,
          };
        }),
      );
    },

    updateTodo(id: string, patch: UpdatePatch): ResultAsync<Todo, TodoError> {
      const patchResult = resolvePatch(patch);
      if (patchResult.isErr()) {
        return errAsync(patchResult.error);
      }

      return repo.update(id, patchResult.value).map(rowToTodo);
    },

    deleteTodo(id: string): ResultAsync<void, TodoError> {
      return repo.delete(id);
    },

    toggleAll(): ResultAsync<void, TodoError> {
      return repo.findAll("all", undefined, 1, Number.MAX_SAFE_INTEGER).andThen((result) => {
        const todos = result.items;

        const state: ToggleAllState = match(todos)
          .when(
            (t) => t.length === 0,
            (): ToggleAllState => ({ type: "EMPTY" }),
          )
          .when(
            (t) => t.every((r) => r.completed),
            (): ToggleAllState => ({ type: "ALL_COMPLETED" }),
          )
          .otherwise((): ToggleAllState => ({ type: "HAS_INCOMPLETE" }));

        const shouldComplete = match(state)
          .with({ type: "EMPTY" }, () => false)
          .with({ type: "ALL_COMPLETED" }, () => false)
          .with({ type: "HAS_INCOMPLETE" }, () => true)
          .exhaustive();

        return repo.updateAllCompleted(shouldComplete);
      });
    },

    clearCompleted(): ResultAsync<void, TodoError> {
      return repo.deleteAllCompleted();
    },
  };
}
