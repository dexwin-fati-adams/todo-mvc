import type { FastifyInstance } from "fastify";
import {
  CreateTodoRequestSchema,
  StatusQuerySchema,
  TodoIdParamSchema,
  TodoListResponseSchema,
  TodoSchema,
  UpdateTodoRequestSchema,
} from "contracts";
import { match } from "ts-pattern";
import type { TodoService } from "./todo.service.js";
import { toHttpError } from "./todo.errors.js";
import type { Result } from "neverthrow";
import { sendValidated } from "@/lib/response.js";

export interface TodoDeps {
  todoService: TodoService;
}

function toMatchable<T, E>(result: Result<T, E>) {
  return result.match(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}

// /If the user's input is wrong, take all the Zod errors and turn them into a simple message that the API can return."
//“It returns a string containing all the Zod validation errors, formatted into a readable message.”
function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues
    .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join(", ");
}

export async function todoRoutes(fastify: FastifyInstance, deps: TodoDeps) {
  const { todoService } = deps;

  fastify.post("/todos", {}, async (request, reply) => {
    const body = CreateTodoRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", message: formatZodIssues(body.error.issues) });
    }

    const result = await todoService.createTodo(body.data.title);
    return match(toMatchable(result))
      .with({ ok: true }, ({ value }) =>
        sendValidated({
          schema: TodoSchema,
          body: value,
          status: 201,
          reply,
          request,
          context: "todos/create/201",
        }),
      )
      .with({ ok: false }, ({ error }) => {
        const { status, body: errorBody } = toHttpError(error);
        return reply.status(status).send(errorBody);
      })
      .exhaustive();
  });

  fastify.post("/todos/toggle-all", {}, async (_req, reply) => {
    const result = await todoService.toggleAll();
    return match(toMatchable(result))
      .with({ ok: true }, () => reply.status(204).send())
      .with({ ok: false }, ({ error }) => {
        const { status, body } = toHttpError(error);
        return reply.status(status).send(body);
      })
      .exhaustive();
  });

  fastify.get("/todos", {}, async (request, reply) => {
    const query = StatusQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", message: formatZodIssues(query.error.issues) });
    }

    const result = await todoService.listTodos(query.data.status);
    return match(toMatchable(result))
      .with({ ok: true }, ({ value }) =>
        sendValidated({
          schema: TodoListResponseSchema,
          body: value,
          status: 200,
          reply,
          request,
          context: "todos/list/200",
        }),
      )
      .with({ ok: false }, ({ error }) => {
        const { status, body } = toHttpError(error);
        return reply.status(status).send(body);
      })
      .exhaustive();
  });

  fastify.patch("/todos/:id", {}, async (request, reply) => {
    const params = TodoIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", message: formatZodIssues(params.error.issues) });
    }

    const body = UpdateTodoRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", message: formatZodIssues(body.error.issues) });
    }

    const result = await todoService.updateTodo(params.data.id, body.data);
    return match(toMatchable(result))
      .with({ ok: true }, ({ value }) =>
        sendValidated({
          schema: TodoSchema,
          body: value,
          status: 200,
          reply,
          request,
          context: "todos/update/200",
        }),
      )
      .with({ ok: false }, ({ error }) => {
        const { status, body: errorBody } = toHttpError(error);
        return reply.status(status).send(errorBody);
      })
      .exhaustive();
  });

  fastify.delete("/todos/completed", {}, async (_req, reply) => {
    const result = await todoService.clearCompleted();
    return match(toMatchable(result))
      .with({ ok: true }, () => reply.status(204).send())
      .with({ ok: false }, ({ error }) => {
        const { status, body } = toHttpError(error);
        return reply.status(status).send(body);
      })
      .exhaustive();
  });

  fastify.delete("/todos/:id", {}, async (request, reply) => {
    const params = TodoIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply
        .status(400)
        .send({ error: "VALIDATION_ERROR", message: formatZodIssues(params.error.issues) });
    }

    const result = await todoService.deleteTodo(params.data.id);
    return match(toMatchable(result))
      .with({ ok: true }, () => reply.status(204).send())
      .with({ ok: false }, ({ error }) => {
        const { status, body } = toHttpError(error);
        return reply.status(status).send(body);
      })
      .exhaustive();
  });
}
