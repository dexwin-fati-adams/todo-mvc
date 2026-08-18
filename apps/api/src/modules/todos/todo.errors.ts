export type TodoNotFoundError = {
  type: 'TODO_NOT_FOUND';
  id: string;
};

export type TodoDbError = {
  type: 'TODO_DB_ERROR';
  cause: unknown;
};

export type TodoRepositoryError = TodoNotFoundError | TodoDbError;

export const TodoErrors = {
  notFound(id: string): TodoNotFoundError {
    return { type: 'TODO_NOT_FOUND', id };
  },
  dbError(cause: unknown): TodoDbError {
    return { type: 'TODO_DB_ERROR', cause };
  },
};
