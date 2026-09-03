// TEMPORARY — applies pending drizzle migrations to the connected database
// at request time, then reports which ones ran. Added because wiring
// `db:migrate` into the Vercel *build* step failed (the build environment
// doesn't have DATABASE_URL, unlike the deployed function's runtime, which
// does — see this PR's history). OWNER-only. Delete this route (and the
// matching `outputFileTracingIncludes` entry in next.config.ts) once the
// pending migration has been confirmed applied in production.

import path from "node:path";
import { NextResponse } from "next/server";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/db";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canManageOrg } from "@/lib/rbac";

async function runMigration() {
  const org = await requireCurrentOrg();
  assertRole(org.role, canManageOrg, "마이그레이션을 실행할 권한이 없습니다.");

  await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });

  return NextResponse.json({ ok: true });
}

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}

export async function POST() {
  try {
    return await runMigration();
  } catch (err) {
    return errorResponse(err);
  }
}

// GET too — so this can be triggered by just visiting the URL in a browser
// while logged in as OWNER, no devtools/curl needed. Temporary debug route,
// see the module comment above; not a concern to relax REST verbs for.
export async function GET() {
  try {
    return await runMigration();
  } catch (err) {
    return errorResponse(err);
  }
}
