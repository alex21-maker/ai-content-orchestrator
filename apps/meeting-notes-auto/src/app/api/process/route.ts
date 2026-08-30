import { NextRequest, NextResponse } from "next/server";
import { uploadAudioToDrive } from "@/lib/google-drive";
import { transcribeAudio } from "@/lib/whisper";
import { analyzeMeetingTranscript } from "@/lib/analysis";
import { sendToSlack } from "@/lib/slack";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/process — the whole pipeline in one call:
// audio (multipart) -> Google Drive upload -> Whisper transcription ->
// Claude analysis -> Slack delivery. No auth, no DB — stateless by design.
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

    const analysis = await analyzeMeetingTranscript(transcript);
    const slack = await sendToSlack({ driveLink: drive.webViewLink, transcript, analysis });

    return NextResponse.json({
      driveLink: drive.webViewLink,
      transcript,
      meetingName,
      analysis,
      slack,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "처리 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
