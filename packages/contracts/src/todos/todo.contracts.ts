import { z } from "zod";
import { match } from "ts-pattern";

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

<<<<<<< HEAD
const FilterEnum = z.enum(["all", "active", "completed"]);
export type Filter = z.infer<typeof FilterEnum>;
// for validating untrusted input
export const FilterQuerySchema = z
  .object({
    status: FilterEnum.default("all"),
  })
  .strict();
export type FilterQuery = z.infer<typeof FilterQuerySchema>;

export const TODO_FILTERS = {
  all: "all",
  active: "active",
  completed: "completed",
} as const satisfies Record<Filter, Filter>;
=======
export const FilterQuerySchema = z.object({
    status: z.enum(['all', 'active', 'completed']).default('all'),
});
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
>>>>>>> d100392 (fix: update todo contracts)

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

<<<<<<< HEAD
type TodoPath = "/" | "/active" | "/completed";

export function getFilterFromPath(path: TodoPath): Filter {
  return match(path)
    .with("/", () => TODO_FILTERS.all)
    .with("/active", () => TODO_FILTERS.active)
    .with("/completed", () => TODO_FILTERS.completed)
    .exhaustive();
}
    active: "active",
=======
  const FilterEnum = z.enum(["all", "active", "completed"]);
  export type Filter = z.infer<typeof FilterEnum>;
  // for validating untrusted input
  export const FilterQuerySchema = z
    .object({
      status: FilterEnum.default("all"),
    })
    .strict();
  export type FilterQuery = z.infer<typeof FilterQuerySchema>;

  export const TODO_FILTERS = {
    all: "all",
    active: "active",
    completed: "completed",
  } as const satisfies Record<Filter, Filter>;

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






>>>>>>> d100392 (fix: update todo contracts)
