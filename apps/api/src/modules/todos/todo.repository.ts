import { and, count, eq, ilike, inArray } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import { match } from "ts-pattern";
import type { Status } from "contracts";
import type { Db } from "@/lib/db.js";
import { todosTable, type TodoDbRow } from "@/lib/schema.js";
import { TodoErrors, type TodoDbError, type TodoNotFoundError } from "./todo.errors.js";

type TodoUpdateError = TodoDbError | TodoNotFoundError;

export interface FindAllResult {
  items: TodoDbRow[];
  totalItems: number;
}

// ok: every id was found and set. conflict: some ids do not exist and nothing was changed.
export type BatchResult =
  { kind: "ok"; updatedCount: number } | { kind: "conflict"; missingIds: string[] };

export interface TodoRepository {
  withTransaction(tx: Db): TodoRepository;
  findAll(
    status: Status,
    search: string | undefined,
    page: number,
    pageSize: number,
  ): ResultAsync<FindAllResult, TodoDbError>;
  findById(id: string): ResultAsync<TodoDbRow, TodoUpdateError>;
  insert(row: TodoDbRow): ResultAsync<TodoDbRow, TodoDbError>;
  update(
    id: string,
    patch: Partial<Pick<TodoDbRow, "title" | "completed">>,
  ): ResultAsync<TodoDbRow, TodoUpdateError>;
  delete(id: string): ResultAsync<void, TodoUpdateError>;
  updateAllCompleted(completed: boolean): ResultAsync<void, TodoDbError>;
  deleteAllCompleted(): ResultAsync<void, TodoDbError>;
  setAllCompleted(completed: boolean): ResultAsync<number, TodoDbError>;
  deleteCompleted(): ResultAsync<number, TodoDbError>;
  updateBatch(ids: string[], completed: boolean): ResultAsync<BatchResult, TodoDbError>;
}

//In LIKE and ILIKE, % means "any text", _ means "any one character", and \ is the escape character.
//A search is plain text typed by a user, so each of those three gets a backslash in front of it.
//Without this, searching for "_" matches every title.
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export function createTodoRepository(db: Db): TodoRepository {
  function make(tx: Db): TodoRepository {
    return {
      withTransaction(newTx: Db): TodoRepository {
        return make(newTx);
      },

      findAll(
        status: Status,
        search: string | undefined,
        page: number,
        pageSize: number,
      ): ResultAsync<FindAllResult, TodoDbError> {
        const statusCondition = match(status)
          .with("active", () => eq(todosTable.completed, false))
          .with("completed", () => eq(todosTable.completed, true))
          .with("all", () => undefined)
          .exhaustive();

        //Give me todos matching this status AND containing this search word.
        const searchCondition = search
          ? ilike(todosTable.title, `%${escapeLikePattern(search)}%`)
          : undefined;

        const whereCondition = and(statusCondition, searchCondition);

        //Get the todos for the current page, and also count all the todos that match the conditions.”
        const itemsQuery = tx
          .select()
          .from(todosTable)
          .where(whereCondition)
          .orderBy(todosTable.createdAt)
          .limit(pageSize)
          .offset((page - 1) * pageSize);

        const countQuery = tx.select({ value: count() }).from(todosTable).where(whereCondition);

        return ResultAsync.fromPromise(Promise.all([itemsQuery, countQuery]), (cause) =>
          TodoErrors.dbError(cause),
        ).map(([items, countRows]) => ({
          items,
          totalItems: countRows[0]?.value ?? 0,
        }));
      },

      findById(id: string): ResultAsync<TodoDbRow, TodoUpdateError> {
        return ResultAsync.fromPromise(
          tx.select().from(todosTable).where(eq(todosTable.id, id)),
          (cause): TodoDbError => TodoErrors.dbError(cause),
        ).andThen((rows) => {
          if (rows.length === 0) {
            return err(TodoErrors.notFound(id));
          }
          return ok(rows[0]!);
        });
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

      delete(id: string): ResultAsync<void, TodoUpdateError> {
        return ResultAsync.fromPromise(
          tx.delete(todosTable).where(eq(todosTable.id, id)).returning(),
          (cause): TodoDbError => TodoErrors.dbError(cause),
        ).andThen((rows) => {
          if (rows.length === 0) {
            return err(TodoErrors.notFound(id));
          }
          return ok(undefined);
        });
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

      // Single UPDATE ... RETURNING: atomic on its own, no WHERE means every
      // row is affected regardless of filter/page, and rows.length gives the
      // exact count — 0 for an empty table.
      setAllCompleted(completed: boolean): ResultAsync<number, TodoDbError> {
        return ResultAsync.fromPromise(
          tx.update(todosTable).set({ completed }).returning(),
          (cause) => TodoErrors.dbError(cause),
        ).map((rows) => rows.length);
      },

      // Single DELETE ... WHERE completed = true RETURNING: atomic on its
      // own (one statement, no read-then-write gap), scoped to the full
      // table regardless of any page/search state the caller had, and
      // rows.length gives the exact number removed — 0 when there were no
      // completed todos, which is a valid, successful result. Active todos
      // are untouched because the WHERE clause only ever matches
      // completed = true rows.
      deleteCompleted(): ResultAsync<number, TodoDbError> {
        return ResultAsync.fromPromise(
          tx.delete(todosTable).where(eq(todosTable.completed, true)).returning(),
          (cause) => TodoErrors.dbError(cause),
        ).map((rows) => rows.length);
      },
      // One transaction: UPDATE ... WHERE id IN (...) RETURNING id. If any requested id
      // was not returned, it does not exist, so the whole transaction is rolled back and
      // the missing ids come back as a conflict value (in request order).
      updateBatch(ids: string[], completed: boolean): ResultAsync<BatchResult, TodoDbError> {
        const run = async (): Promise<BatchResult> => {
          let missingIds: string[] = [];
          try {
            return await tx.transaction(async (trx): Promise<BatchResult> => {
              const rows = await trx
                .update(todosTable)
                .set({ completed })
                .where(inArray(todosTable.id, ids))
                .returning({ id: todosTable.id });
              const found = new Set(rows.map((row) => row.id));
              const missing = ids.filter((id) => !found.has(id));
              if (missing.length > 0) {
                missingIds = missing;
                return trx.rollback();
              }
              return { kind: "ok", updatedCount: rows.length };
            });
          } catch (cause) {
            if (missingIds.length > 0) {
              return { kind: "conflict", missingIds };
            }
            throw cause;
          }
        };
        return ResultAsync.fromPromise(run(), (cause) => TodoErrors.dbError(cause));
      },
    };
  }

  return make(db);
}
