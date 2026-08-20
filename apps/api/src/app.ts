import Fastify from 'fastify';
import cors from '@fastify/cors';

import { createDb } from './lib/db.js';
import { config } from './lib/config.js';
import { createTodoRepository } from './modules/todos/todo.repository.js';
import { createTodoService } from './modules/todos/todo.service.js';
import { todoRoutes } from './modules/todos/todo.route.js';

//fastify set up and register routes and plugins
export async function buildApp() {
  const fastify = Fastify({ logger: true });

  // Cross-cutting concerns via plugin
  await fastify.register(cors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Dependency wiring — built once at startup, injected into modules
  const db = createDb(config);
  const todoRepo = createTodoRepository(db);
  const todoService = createTodoService(todoRepo);

  // Route registration — one entrypoint per module
  await fastify.register(todoRoutes, { todoService });

  return fastify;
}