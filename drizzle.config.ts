import { defineConfig } from "drizzle-kit";

// Prefer DATABASE_URL, fall back to POSTGRES_URL (Vercel Postgres's
// auto-injected var name) — see src/db/index.ts for the same fallback.
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) is not set. Copy .env.example to .env and fill it in, " +
      "or `vercel env pull` if you're running this against a Vercel Postgres database."
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
  strict: true,
  verbose: true,
});
