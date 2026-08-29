// Shared helpers for the /api/meetings/* route handlers.

import { db } from "@/db";
import { meetings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** Loads a meeting scoped to the caller's org, or null (used to return 404, not 403, on tenant mismatch). */
export async function loadOwnedMeeting(meetingId: string, organizationId: string) {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.organizationId, organizationId)))
    .limit(1);
  return meeting ?? null;
}
