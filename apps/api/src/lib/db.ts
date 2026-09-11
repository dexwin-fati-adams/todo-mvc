import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import type { Config } from "./config.js";

export type Db = ReturnType<typeof drizzle<typeof schema>> & { $client: Pool };

export function createDb(config: Config): Db {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema });
  return Object.assign(db, { $client: pool });
}
