import { NextResponse } from "next/server";
import { db } from "@/db";
import { meetingSlackDeliveries, meetingSummaries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { loadOwnedMeeting } from "@/lib/meetings";

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/meetings/[id] — meeting detail + latest analysis summary + Slack delivery history.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    const { id } = await params;

    const meeting = await loadOwnedMeeting(id, org.organizationId);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [summary] = await db.select().from(meetingSummaries).where(eq(meetingSummaries.meetingId, id)).limit(1);
    const deliveries = await db
      .select()
      .from(meetingSlackDeliveries)
      .where(eq(meetingSlackDeliveries.meetingId, id))
      .orderBy(desc(meetingSlackDeliveries.occurredAt));

    return NextResponse.json({ meeting, summary: summary ?? null, slackDeliveries: deliveries });
  } catch (err) {
    return errorResponse(err);
  }
}
