import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetingSlackDeliveries, meetingSummaries, meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { loadOwnedMeeting } from "@/lib/meetings";
import { sendMeetingSummaryToSlack } from "@/lib/slack";
import type { MeetingSummaryArtifact } from "@/lib/agents/meeting-analysis";

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// POST /api/meetings/[id]/slack — sends the meeting's latest analysis summary
// to Slack (real, via SLACK_WEBHOOK_URL, or simulated if unset — see
// src/lib/slack.ts) and records the delivery. Requires EDITOR+ and an
// existing analysis.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "Slack로 전송할 권한이 없습니다.");
    const { id } = await params;

    const meeting = await loadOwnedMeeting(id, org.organizationId);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [summaryRow] = await db.select().from(meetingSummaries).where(eq(meetingSummaries.meetingId, id)).limit(1);
    if (!summaryRow) {
      return NextResponse.json({ error: "먼저 회의를 분석하세요 (분석 결과가 없습니다)." }, { status: 409 });
    }

    const summary: MeetingSummaryArtifact = {
      type: "meeting_summary",
      languageBreakdown: summaryRow.languageBreakdown as MeetingSummaryArtifact["languageBreakdown"],
      keyStatementsKo: summaryRow.keyStatementsKo as MeetingSummaryArtifact["keyStatementsKo"],
      keyStatementsZh: summaryRow.keyStatementsZh as MeetingSummaryArtifact["keyStatementsZh"],
      decisions: summaryRow.decisions as MeetingSummaryArtifact["decisions"],
      actionItems: summaryRow.actionItems as MeetingSummaryArtifact["actionItems"],
      meetingRisks: summaryRow.meetingRisks as MeetingSummaryArtifact["meetingRisks"],
      statementCount: 0,
    };

    const delivery = await sendMeetingSummaryToSlack({
      title: meeting.title,
      occurredAt: meeting.occurredAt,
      participants: meeting.participants,
      summary,
    });

    const [deliveryRow] = await db
      .insert(meetingSlackDeliveries)
      .values({
        meetingId: id,
        mode: delivery.mode,
        succeeded: delivery.succeeded,
        responseSummary: delivery.responseSummary,
        errorMessage: delivery.errorMessage ?? null,
        deliveredById: org.userId,
      })
      .returning();

    if (delivery.succeeded) {
      await db.update(meetings).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(meetings.id, id));
    }

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "meeting.slack_deliver",
      targetType: "meeting",
      targetId: id,
      metadata: { mode: delivery.mode, succeeded: delivery.succeeded },
    });

    return NextResponse.json({ delivery: deliveryRow }, { status: delivery.succeeded ? 200 : 502 });
  } catch (err) {
    return errorResponse(err);
  }
}
