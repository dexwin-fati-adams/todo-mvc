import { z } from "zod";
import { match } from "ts-pattern";

export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  completed: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Todo = z.infer<typeof TodoSchema>;

export const CreateTodoRequestSchema = z.object({
  title: z.string().min(1, "Title cannot be empty"),
});
export type CreateTodoRequest = z.infer<typeof CreateTodoRequestSchema>;

export const UpdateTodoRequestSchema = z.object({
  title: z.string().min(1, "Title cannot be empty").optional(),
  completed: z.boolean().optional(),
});
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequestSchema>;

export const TodoListResponseSchema = z.object({
  todos: z.array(TodoSchema),
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
});
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;

const StatusEnum = z.enum(["all", "active", "completed"]);
export type Status = z.infer<typeof StatusEnum>;
//  for validating untrusted input
export const StatusQuerySchema = z
  .object({
    status: StatusEnum.default("all"),
  })
  .strict();
export type StatusQuery = z.infer<typeof StatusQuerySchema>;

export const TODO_STATUSES = {
  all: "all",
  active: "active",
  completed: "completed",
} as const satisfies Record<Status, Status>;

export const TodoIdParamSchema = z.object({ id: z.string().uuid() });
export type TodoIdParam = z.infer<typeof TodoIdParamSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

type TodoPath = "/" | "/active" | "/completed";

export function getStatusFromPath(path: TodoPath): Status {
  return match(path)
    .with("/", () => TODO_STATUSES.all)
    .with("/active", () => TODO_STATUSES.active)
    .with("/completed", () => TODO_STATUSES.completed)
    .exhaustive();
}