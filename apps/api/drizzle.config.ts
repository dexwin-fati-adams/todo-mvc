import { defineConfig } from 'drizzle-kit';
import { config } from './src/lib/config.js';

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.databaseUrl,
  },
});
