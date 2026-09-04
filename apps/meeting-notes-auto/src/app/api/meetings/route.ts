import { NextResponse } from "next/server";
import { listMeetingsGroupedByProject } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const groups = await listMeetingsGroupedByProject();
    return NextResponse.json({ groups });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "회의록 목록을 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
