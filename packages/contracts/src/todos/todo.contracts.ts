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

export const FilterQuerySchema = z.object({
  filter: z.enum(["all", "active", "completed"]).default("all"),
});

export const TODO_FILTERS = {
  all: "all",
  active: "active",
  completed: "completed",
} as const;

export type Filter = (typeof TODO_FILTERS)[keyof typeof TODO_FILTERS];

export const TodoIdParamSchema = z.object({ id: z.string().uuid() });
export type TodoIdParam = z.infer<typeof TodoIdParamSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

type TodoPath = "/" | "/active" | "/completed";

export function getFilterFromPath(path: TodoPath): Filter {
  return match(path)
    .with("/", () => TODO_FILTERS.all)
    .with("/active", () => TODO_FILTERS.active)
    .with("/completed", () => TODO_FILTERS.completed)
    .exhaustive();
}
