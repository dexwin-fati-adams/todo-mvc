
import { match } from 'ts-pattern';

export type TodoNotFoundError = { type: 'TODO_NOT_FOUND'; id: string };
export type TodoEmptyTitleError = { type: 'TODO_EMPTY_TITLE' };
export type TodoValidationError = { type: 'TODO_VALIDATION_ERROR'; message: string };
export type TodoDbError = { type: 'TODO_DB_ERROR'; cause: unknown };

//describes the possible errors.
export type TodoError =
  | TodoNotFoundError
  | TodoEmptyTitleError
  | TodoValidationError
  | TodoDbError;

export const TodoErrors = {
  notFound: (id: string): TodoNotFoundError => ({ type: 'TODO_NOT_FOUND', id }),
  emptyTitle: (): TodoEmptyTitleError => ({ type: 'TODO_EMPTY_TITLE' }),
  validation: (message: string): TodoValidationError => ({ type: 'TODO_VALIDATION_ERROR', message }),
  dbError: (cause: unknown): TodoDbError => ({ type: 'TODO_DB_ERROR', cause }),
} as const;

export type NotFoundResponse = { error: 'NOT_FOUND'; message: string };
export type ValidationErrorResponse = { error: 'VALIDATION_ERROR'; message: string };
export type ServiceUnavailableResponse = { error: 'SERVICE_UNAVAILABLE'; message: string };

export type TodoHttpError =
  | { status: 404; body: NotFoundResponse }
  | { status: 400; body: ValidationErrorResponse }
  | { status: 503; body: ServiceUnavailableResponse };

export function toHttpError(error: TodoError): TodoHttpError {
  return match(error)
    .with({ type: 'TODO_NOT_FOUND' }, (e) => ({
      status: 404 as const,
      body: { error: 'NOT_FOUND' as const, message: `Todo ${e.id} not found` },
    }))
    .with({ type: 'TODO_EMPTY_TITLE' }, () => ({
      status: 400 as const,
      body: { error: 'VALIDATION_ERROR' as const, message: 'Title cannot be empty' },
    }))
    .with({ type: 'TODO_VALIDATION_ERROR' }, (e) => ({
      status: 400 as const,
      body: { error: 'VALIDATION_ERROR' as const, message: e.message },
    }))
    .with({ type: 'TODO_DB_ERROR' }, () => ({
      status: 503 as const,
      body: { error: 'SERVICE_UNAVAILABLE' as const, message: 'Database error, please retry' },
    }))
    .exhaustive();
}