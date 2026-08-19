import 'dotenv/config';
import { z } from 'zod';


const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number(),
  HOST: z.string(),
  CORS_ORIGIN: z.string()
});
//if anything is wrong, crash immediately
const parsed = configSchema.parse(process.env);

export const config = {
  databaseUrl: parsed.DATABASE_URL,
  port: parsed.PORT,
  host: parsed.HOST,
  corsOrigin: parsed.CORS_ORIGIN,
};

export type Config = typeof config;