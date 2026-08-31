import { NextRequest, NextResponse } from "next/server";
import { getMeeting, deleteMeeting } from "@/lib/db";
import { deleteFileFromDrive } from "@/lib/google-drive";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const meeting = await getMeeting(id);
    if (!meeting) {
      return NextResponse.json({ error: "회의록을 찾을 수 없습니다." }, { status: 404 });
    }

    try {
      await deleteFileFromDrive(meeting.driveFileId);
    } catch (driveErr) {
      // The Drive file may already be gone (manually deleted, etc.) — don't
      // block removing the list entry over that.
      console.error("Failed to delete Drive file:", driveErr);
    }

    await deleteMeeting(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
