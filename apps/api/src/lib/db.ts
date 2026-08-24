import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import type { Config } from "./config.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(config: Config): Db {
  const pool = new Pool({ connectionString: config.databaseUrl });
  return drizzle(pool, { schema });
}
