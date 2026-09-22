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

// It validates the status, search, page, and pageSize query parameters for
// GET /todos. status defaults to all, search is optional (non-blank, max 100
// chars), page defaults to 1, and pageSize defaults to 20 (max 100).
export const StatusQuerySchema = z
  .object({
    status: StatusEnum.default("all"),
    search: z
      .string()
      .trim()
      .min(1, "Search cannot be blank")
      .max(100, "Search must be 100 characters or fewer")
      .optional(),

    //corce.number() converts the value to a number if possible, otherwise it will throw an error and it fromone type to the other
    //page = which page u want to get, pageSize = how many items per page
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  //strict() rejects extra fields that aren't defined.
  .strict();
export type StatusQuery = z.infer<typeof StatusQuerySchema>;

export const TODO_STATUSES = {
  all: "all",
  active: "active",
  completed: "completed",
} as const satisfies Record<Status, Status>;

//Universally Unique Identifier
export const TodoIdParamSchema = z.object({ id: z.string().uuid() });
export type TodoIdParam = z.infer<typeof TodoIdParamSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// PATCH /todos — sets completed for every todo in the collection, not just
// the current page/filter. Accepts exactly one field: completed. .strict()
// rejects anything else, including status/search/page if a client sends it.
export const SetAllCompletedRequestSchema = z
  .object({
    completed: z.boolean(),
  })
  .strict();
export type SetAllCompletedRequest = z.infer<typeof SetAllCompletedRequestSchema>;

// Response for PATCH /todos — the number of todos actually updated by the
// single UPDATE ... RETURNING statement. 0 for an empty collection.
export const SetAllCompletedResponseSchema = z.object({
  updatedCount: z.number().int().min(0),
});
export type SetAllCompletedResponse = z.infer<typeof SetAllCompletedResponseSchema>;

// DELETE /todos?status=completed — the only accepted query for the
// collection-delete route. status is REQUIRED and must be the literal
// "completed": missing, "all"/"active", or any other value all fail this
// check. A duplicated ?status=completed&status=completed is parsed as an
// array by the query-string parser, which also fails z.literal("completed").
// .strict() rejects any other query key (page, search, pageSize, etc.), so
// there is no unscoped "delete everything" or partial-scope variant of this
// route — only the full completed-subset delete is representable here.
export const DeleteCompletedQuerySchema = z
  .object({
    status: z.literal("completed"),
  })
  .strict();
export type DeleteCompletedQuery = z.infer<typeof DeleteCompletedQuerySchema>;

// Response for DELETE /todos?status=completed — the number of todos
// actually removed by the single DELETE ... RETURNING statement. 0 when
// there were no completed todos to remove (not an error).
export const DeleteCompletedResponseSchema = z.object({
  deletedCount: z.number().int().min(0),
});
export type DeleteCompletedResponse = z.infer<typeof DeleteCompletedResponseSchema>;

type TodoPath = "/" | "/active" | "/completed";

export function getStatusFromPath(path: TodoPath): Status {
  return match(path)
    .with("/", () => TODO_STATUSES.all)
    .with("/active", () => TODO_STATUSES.active)
    .with("/completed", () => TODO_STATUSES.completed)
    .exhaustive();
}