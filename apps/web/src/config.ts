import { z } from 'zod';

const configSchema = z.object({
  VITE_API_URL: z.string().default('http://localhost:3001'),
});

const parsed = configSchema.parse(import.meta.env);

export const config = {
  apiUrl: parsed.VITE_API_URL,
};