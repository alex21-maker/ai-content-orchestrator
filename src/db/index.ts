import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Prefer DATABASE_URL (what drizzle.config.ts / this repo's .env use), but
// fall back to POSTGRES_URL — the name Vercel's own Postgres integration
// auto-injects when you connect a Vercel Postgres database to this project
// from the dashboard's Storage tab. This means you don't have to manually
// rename anything after connecting Vercel Postgres.
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

const pool =
  global.__pgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
