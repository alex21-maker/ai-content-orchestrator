// Asset storage abstraction — see docs/PRD.md section 9 (S3-compatible
// storage) and the Phase 1 principle "미구현 기능을 구현된 것처럼 표시하지
// 않는다" (don't present unbuilt features as if they were built).
//
// ============================================================================
// DEV-ONLY IMPLEMENTATION — READ BEFORE DEPLOYING
// ============================================================================
// There is no real S3-compatible bucket configured yet (no credentials were
// provided for this build). This file currently saves uploaded files to the
// LOCAL FILESYSTEM under `public/uploads/<contentItemId>/<filename>` and
// returns a `/uploads/...` URL path that Next.js serves as a static asset in
// dev (and in a traditional long-lived Node server).
//
// This will NOT work correctly in production on Vercel:
//   - Vercel's serverless function filesystem is EPHEMERAL and, outside of
//     `/tmp`, READ-ONLY at runtime. Writes here either fail outright or
//     silently disappear the moment the instance recycles.
//   - Even where writes succeed (e.g. long-lived containers), files written
//     by one instance are not visible to other instances/regions.
//   - `public/` is baked into the deployment bundle at build time, so
//     runtime writes to it never become part of what's actually served.
//
// Phase 2 TODO: replace the body of `saveAsset` with a real S3-compatible
// backend (e.g. Vercel Blob via `BLOB_READ_WRITE_TOKEN`, or S3/R2 via
// AWS SDK + access key/secret env vars). The function signature below
// (`saveAsset(file, contentItemId) => Promise<{ url }>`) is the seam:
// nothing outside this file should need to change when that swap happens.
// ============================================================================

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function safeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  // Keep this narrow — only pass through simple alphanumeric extensions.
  if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
  return "";
}

/**
 * Saves an uploaded File to local disk under public/uploads/<contentItemId>/
 * and returns a URL path Next.js can serve statically.
 *
 * DEV-ONLY — see the module-level comment above. Do not rely on this
 * persisting in a Vercel production deployment.
 */
export async function saveAsset(file: File, contentItemId: string): Promise<{ url: string }> {
  const dir = path.join(UPLOADS_ROOT, contentItemId);
  await mkdir(dir, { recursive: true });

  const ext = safeExtension(file.name || "");
  const filename = `${randomUUID()}${ext}`;
  const filePath = path.join(dir, filename);

  const arrayBuffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  return { url: `/uploads/${contentItemId}/${filename}` };
}
