import Fastify from "fastify";
import cors from "@fastify/cors";

import { createDb } from "./lib/db.js";
import { config } from "./lib/config.js";
import { createTodoRepository } from "./modules/todos/todo.repository.js";
import { createTodoService } from "./modules/todos/todo.service.js";
import { todoRoutes } from "./modules/todos/todo.route.js";

//This code sets up the Fastify server, connects the database, creates the Todo repository
// and Todo service, and connects the Todo routes to the server

//fastify set up and register routes and plugins
export async function buildApp() {
  const fastify = Fastify({ logger: true });

  // Cross-cutting concerns via plugin
  await fastify.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  // Dependency wiring — built once at startup, injected into modules
  const db = createDb(config);

  // Ensure the underlying pg Pool is closed when the Fastify instance is
  // closed (app.close()). Without this, each buildApp() call leaks its
  // Pool's connections (default max: 10) for the lifetime of the process,
  // which exhausts Postgres's connection limit across test files that
  // call buildApp() multiple times.
  fastify.addHook("onClose", async () => {
    await db.$client.end();
  });

  const todoRepo = createTodoRepository(db);
  const todoService = createTodoService(todoRepo);

  // Route registration — one entrypoint per module
  await fastify.register(todoRoutes, { todoService });

  return fastify;
}
