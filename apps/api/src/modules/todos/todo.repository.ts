import { eq } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import { match } from "ts-pattern";
import type { Status } from "contracts";
import type { Db } from "@/lib/db.js";
import { todosTable, type TodoDbRow } from "@/lib/schema.js";
import { TodoErrors, type TodoDbError, type TodoNotFoundError } from "./todo.errors.js";

type TodoUpdateError = TodoDbError | TodoNotFoundError;

export interface TodoRepository {
  withTransaction(tx: Db): TodoRepository;
  findAll(status: Status): ResultAsync<TodoDbRow[], TodoDbError>;
  insert(row: TodoDbRow): ResultAsync<TodoDbRow, TodoDbError>;
  update(
    id: string,
    patch: Partial<Pick<TodoDbRow, "title" | "completed">>,
  ): ResultAsync<TodoDbRow, TodoUpdateError>;
  delete(id: string): ResultAsync<void, TodoDbError>;
  updateAllCompleted(completed: boolean): ResultAsync<void, TodoDbError>;
  deleteAllCompleted(): ResultAsync<void, TodoDbError>;
}

export function createTodoRepository(db: Db): TodoRepository {
  function make(tx: Db): TodoRepository {
    return {
      withTransaction(newTx: Db): TodoRepository {
        return make(newTx);
      },

      findAll(status: Status): ResultAsync<TodoDbRow[], TodoDbError> {
        return ResultAsync.fromPromise(
          match(status)
            .with("active", () =>
              tx
                .select()
                .from(todosTable)
                .where(eq(todosTable.completed, false))
                .orderBy(todosTable.createdAt),
            )
            .with("completed", () =>
              tx
                .select()
                .from(todosTable)
                .where(eq(todosTable.completed, true))
                .orderBy(todosTable.createdAt),
            )
            .with("all", () => tx.select().from(todosTable).orderBy(todosTable.createdAt))
            .exhaustive(),
          (cause) => TodoErrors.dbError(cause),
        );
      },

      insert(row: TodoDbRow): ResultAsync<TodoDbRow, TodoDbError> {
        return ResultAsync.fromPromise(
          tx
            .insert(todosTable)
            .values(row)
            .returning()
            .then((rows) => rows[0]!),
          (cause) => TodoErrors.dbError(cause),
        );
      },

      update(
        id: string,
        patch: Partial<Pick<TodoDbRow, "title" | "completed">>,
      ): ResultAsync<TodoDbRow, TodoUpdateError> {
        return ResultAsync.fromPromise(
          tx.update(todosTable).set(patch).where(eq(todosTable.id, id)).returning(),
          (cause): TodoDbError => TodoErrors.dbError(cause),
        ).andThen((rows) => {
          if (rows.length === 0) {
            return err(TodoErrors.notFound(id));
          }
          return ok(rows[0]!);
        });
      },

      delete(id: string): ResultAsync<void, TodoDbError> {
        return ResultAsync.fromPromise(
          tx
            .delete(todosTable)
            .where(eq(todosTable.id, id))
            .then(() => undefined),
          (cause) => TodoErrors.dbError(cause),
        );
      },

      updateAllCompleted(completed: boolean): ResultAsync<void, TodoDbError> {
        return ResultAsync.fromPromise(
          tx
            .update(todosTable)
            .set({ completed })
            .then(() => undefined),
          (cause) => TodoErrors.dbError(cause),
        );
      },

      deleteAllCompleted(): ResultAsync<void, TodoDbError> {
        return ResultAsync.fromPromise(
          tx
            .delete(todosTable)
            .where(eq(todosTable.completed, true))
            .then(() => undefined),
          (cause) => TodoErrors.dbError(cause),
        );
      },
    };
  }

  return make(db);
}
