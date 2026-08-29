import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agentMessages, agentRuns, meetingSummaries, meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { loadOwnedMeeting } from "@/lib/meetings";
import { runMeetingAnalysisAgent, MeetingSummaryArtifact } from "@/lib/agents/meeting-analysis";
import { toDbAgentRunStatus } from "@/lib/agents/orchestrator";

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

// POST /api/meetings/[id]/analyze — runs the MEETING_ANALYSIS agent (rule-based
// ko/zh extraction, see src/lib/agents/meeting-analysis.ts) against the
// meeting's transcript, persists the run + structured summary, and advances
// the meeting to ANALYZED. Requires EDITOR+ and a transcript to already exist.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "회의를 분석할 권한이 없습니다.");
    const { id } = await params;

    const meeting = await loadOwnedMeeting(id, org.organizationId);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!meeting.transcriptText) {
      return NextResponse.json({ error: "회의록 텍스트가 없습니다. 먼저 회의록을 등록하세요." }, { status: 409 });
    }

    const result = runMeetingAnalysisAgent({
      title: meeting.title,
      transcriptText: meeting.transcriptText,
      taskId: meeting.id,
    });

    const [run] = await db
      .insert(agentRuns)
      .values({
        agentType: "MEETING_ANALYSIS",
        taskId: result.taskId,
        status: toDbAgentRunStatus(result.status),
        summary: result.summary,
        confidence: result.confidence,
        triggeredById: org.userId,
        finishedAt: new Date(),
      })
      .returning();

    await db.insert(agentMessages).values({
      agentRunId: run.id,
      artifacts: result.artifacts,
      sources: result.sources,
      assumptions: result.assumptions,
      risks: result.risks,
      recommendations: result.recommendations,
      nextAction: result.nextAction,
    });

    const artifact = result.artifacts.find(
      (a): a is MeetingSummaryArtifact => typeof a === "object" && a !== null && (a as MeetingSummaryArtifact).type === "meeting_summary"
    );

    if (!artifact) {
      return NextResponse.json({ error: "분석 결과를 생성하지 못했습니다." }, { status: 500 });
    }

    const [summary] = await db
      .insert(meetingSummaries)
      .values({
        meetingId: id,
        agentRunId: run.id,
        languageBreakdown: artifact.languageBreakdown,
        keyStatementsKo: artifact.keyStatementsKo,
        keyStatementsZh: artifact.keyStatementsZh,
        decisions: artifact.decisions,
        actionItems: artifact.actionItems,
        meetingRisks: artifact.meetingRisks,
        confidence: result.confidence,
      })
      .onConflictDoUpdate({
        target: meetingSummaries.meetingId,
        set: {
          agentRunId: run.id,
          languageBreakdown: artifact.languageBreakdown,
          keyStatementsKo: artifact.keyStatementsKo,
          keyStatementsZh: artifact.keyStatementsZh,
          decisions: artifact.decisions,
          actionItems: artifact.actionItems,
          meetingRisks: artifact.meetingRisks,
          confidence: result.confidence,
          createdAt: new Date(),
        },
      })
      .returning();

    const newStatus = result.status === "blocked" ? "FAILED" : "ANALYZED";
    const [updatedMeeting] = await db
      .update(meetings)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(meetings.id, id))
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "meeting.analyze",
      targetType: "meeting",
      targetId: id,
      metadata: { agentRunId: run.id, status: newStatus, statementCount: artifact.statementCount },
    });

    return NextResponse.json({ meeting: updatedMeeting, summary, agentResult: result });
  } catch (err) {
    return errorResponse(err);
  }
}
