export type TodoNotFoundError = {
  type: 'TODO_NOT_FOUND';
  id: string;
};

export type TodoValidationError = {
  type: 'TODO_VALIDATION_ERROR';
  message: string;
};

export type TodoDatabaseError = {
  type: 'TODO_DATABASE_ERROR';
  message: string;
  cause?: unknown;
};

export type TodoRepositoryError =
  | TodoNotFoundError
  | TodoValidationError
  | TodoDatabaseError;

export function todoNotFound(id: string): TodoNotFoundError {
  return { type: 'TODO_NOT_FOUND', id };
}

export function todoValidationError(message: string): TodoValidationError {
  return { type: 'TODO_VALIDATION_ERROR', message };
}

export function todoDatabaseError(message: string, cause?: unknown): TodoDatabaseError {
  return { type: 'TODO_DATABASE_ERROR', message, cause };
}
