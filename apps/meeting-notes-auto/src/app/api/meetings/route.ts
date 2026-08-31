import { NextResponse } from "next/server";
import { listMeetings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const meetings = await listMeetings();
    return NextResponse.json({ meetings });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "회의록 목록을 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
