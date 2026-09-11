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

// PATCH — partial update. Both fields optional, but at least one must be present. .strict() rejects anything else, including id/createdAt if a client tries to send them.

export const UpdateTodoRequestSchema = z
  .object({
    title: z.string().min(1, "Title cannot be empty").optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one of title or completed must be provided",
  });
export type UpdateTodoRequest = z.infer<typeof UpdateTodoRequestSchema>;

// PUT — full replace. Both fields REQUIRED (no .optional()), and .strict()
// rejects anything else, including id/createdAt if a client tries to send
// them. This is what makes PUT's contract different from PATCH's: PATCH
// accepts a subset of these two keys, PUT demands both every time.
//for PUT, we want to ensure that the client sends both title and completed fields, and that they are valid. The .strict() method ensures that no extra fields are sent, and the .refine() method ensures that at least one of the fields is present.
export const ReplaceTodoRequestSchema = z
  .object({
    title: z.string().min(1, "Title cannot be empty"),
    completed: z.boolean(),
  })
  .strict();
export type ReplaceTodoRequest = z.infer<typeof ReplaceTodoRequestSchema>;

export const TodoListResponseSchema = z.object({
  todos: z.array(TodoSchema),
  activeCount: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type TodoListResponse = z.infer<typeof TodoListResponseSchema>;

const StatusEnum = z.enum(["all", "active", "completed"]);
export type Status = z.infer<typeof StatusEnum>;

export const StatusQuerySchema = z
  .object({
    status: StatusEnum.default("all"),
    search: z
      .string()
      .trim()
      .min(1, "Search cannot be blank")
      .max(100, "Search must be 100 characters or fewer")
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
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