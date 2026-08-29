import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveAsset } from "@/lib/storage";
import { loadOwnedMeeting } from "@/lib/meetings";

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

// POST /api/meetings/[id]/transcript — attach a transcript (pasted/typed text)
// and/or an audio recording (multipart `audio` field) to a meeting. At least
// one of the two must be present. Saving a new transcriptText moves the
// meeting to TRANSCRIBED (any prior analysis becomes stale — re-run analyze).
// Requires EDITOR+.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "회의록을 등록할 권한이 없습니다.");
    const { id } = await params;

    const meeting = await loadOwnedMeeting(id, org.organizationId);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await request.formData();
    const transcriptTextRaw = formData.get("transcriptText");
    const transcriptText = typeof transcriptTextRaw === "string" ? transcriptTextRaw.trim() : "";
    const audio = formData.get("audio");
    const hasAudio = audio instanceof File && audio.size > 0;

    if (!transcriptText && !hasAudio) {
      return NextResponse.json({ error: "transcriptText 또는 audio 파일 중 하나는 필요합니다." }, { status: 400 });
    }

    let audioAssetUrl = meeting.audioAssetUrl;
    if (hasAudio) {
      const { url } = await saveAsset(audio as File, meeting.id);
      audioAssetUrl = url;
    }

    const [updated] = await db
      .update(meetings)
      .set({
        transcriptText: transcriptText || meeting.transcriptText,
        audioAssetUrl,
        status: transcriptText ? "TRANSCRIBED" : meeting.status,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id))
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "meeting.transcript.update",
      targetType: "meeting",
      targetId: id,
      metadata: { hasTranscriptText: Boolean(transcriptText), hasAudio },
    });

    return NextResponse.json({ meeting: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
