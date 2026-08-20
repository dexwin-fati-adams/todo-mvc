import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';

const DEFAULT_SERVICE_UNAVAILABLE_FALLBACK = {
  error: 'SERVICE_UNAVAILABLE' as const,
  message: 'Service is temporarily unavailable. Please try again later.',
};

export function sendValidated<T>(options: {
  schema: ZodType<T>;
  body: unknown;
  status: number;
  reply: FastifyReply;
  request: FastifyRequest;
  context: string;
  fallback?: { error: 'SERVICE_UNAVAILABLE'; message: string };
}) {
  const {
    schema,
    body,
    status,
    reply,
    request,
    context,
    fallback = DEFAULT_SERVICE_UNAVAILABLE_FALLBACK,
  } = options;

  const v = schema.safeParse(body);
  if (!v.success) {
    request.log.error({ context, issues: v.error.issues }, 'response validation failed');
    return reply.status(503).send(fallback);
  }

  return reply.status(status).send(v.data);
}

export function sendServiceUnavailable<T>(options: {
  schema: ZodType<T>;
  body: unknown;
  reply: FastifyReply;
  request: FastifyRequest;
  context: string;
}) {
  options.request.log.error({ context: options.context }, 'service unavailable');
  return sendValidated({ ...options, status: 503 });
}