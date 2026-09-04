import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { uploadAudioToDrive } from "@/lib/google-drive";
import { transcribeAudio } from "@/lib/whisper";
import { analyzeMeetingTranscript } from "@/lib/analysis";
import { sendToSlack } from "@/lib/slack";
import { insertMeeting } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseParticipants(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

// POST /api/process — the whole pipeline in one call:
// audio (multipart) -> Google Drive upload -> Whisper transcription ->
// Claude analysis -> Slack delivery -> save to the meeting list. No auth —
// there's one shared list, no per-user scoping.
//
// Practical limit: Vercel serverless functions cap the request body at
// ~4.5MB, so this comfortably handles a few minutes of compressed audio but
// not long meetings. Phase 2 TODO: chunked/streaming upload for longer
// recordings.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "audio 파일이 필요합니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const mimeType = audio.type || "audio/webm";
    const rawMeetingName = formData.get("meetingName");
    const meetingName = typeof rawMeetingName === "string" ? rawMeetingName.trim().slice(0, 80) : "";
    const participants = parseParticipants(formData.get("participants"));
    const rawSessionId = formData.get("sessionId");
    // Falls back to a fresh id if the client didn't send one (shouldn't
    // happen — every recording generates one at 회의 시작하기 — but a
    // missing id must never crash the request over an optional grouping key).
    const sessionId = typeof rawSessionId === "string" && rawSessionId.trim() ? rawSessionId.trim() : randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = meetingName
      ? `${meetingName.replace(/\//g, "-")}-${timestamp}.webm`
      : `meeting-${timestamp}.webm`;

    const drive = await uploadAudioToDrive(buffer, filename, mimeType);
    const transcript = await transcribeAudio(buffer, filename, mimeType);

    if (!transcript) {
      return NextResponse.json(
        { error: "음성에서 텍스트를 추출하지 못했습니다.", driveLink: drive.webViewLink },
        { status: 422 }
      );
    }

    const analysis = await analyzeMeetingTranscript(transcript, participants);
    const slack = await sendToSlack({ driveLink: drive.webViewLink, transcript, analysis });

    // Recording -> Drive -> Whisper -> Claude -> Slack already succeeded by
    // this point; a DB hiccup (e.g. DATABASE_URL not configured yet) should
    // not throw away that work and report failure to the user.
    let meetingId: string | null = null;
    try {
      const meeting = await insertMeeting({
        projectName: meetingName || "제목 없는 회의",
        participants,
        driveFileId: drive.id,
        driveLink: drive.webViewLink,
        transcript,
        analysis,
        sessionId,
      });
      meetingId = meeting.id;
    } catch (dbErr) {
      console.error("Failed to save meeting to list:", dbErr);
    }

    return NextResponse.json({
      id: meetingId,
      driveLink: drive.webViewLink,
      transcript,
      meetingName,
      participants,
      analysis,
      slack,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "처리 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
