import Link from "next/link";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { canEdit } from "@/lib/rbac";
import { NewMeetingForm } from "@/components/new-meeting-form";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  TRANSCRIBED: "bg-blue-100 text-blue-700",
  ANALYZED: "bg-[var(--accent-soft)] text-[var(--accent)]",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "녹음/회의록 대기",
  TRANSCRIBED: "회의록 등록됨",
  ANALYZED: "분석 완료",
  PUBLISHED: "Slack 전송됨",
  FAILED: "분석 실패",
};

export default async function MeetingsPage() {
  const org = await requireCurrentOrg();

  const rows = await db
    .select()
    .from(meetings)
    .where(eq(meetings.organizationId, org.organizationId))
    .orderBy(desc(meetings.occurredAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">회의</h1>
      </div>
      <p className="mt-1 text-sm text-[var(--sub)]">
        한중 병행 회의를 녹음/회의록으로 등록하고, 언어별 핵심 발언·결정 사항·액션 아이템을 추출해 Slack으로 전달합니다.
      </p>

      {canEdit(org.role) && (
        <div className="mt-4">
          <NewMeetingForm />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--sub)]">아직 등록된 회의가 없습니다.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {rows.map((meeting) => (
            <li key={meeting.id}>
              <Link
                href={`/dashboard/meetings/${meeting.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white px-4 py-3 hover:border-[var(--accent)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{meeting.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--sub)]">
                    {new Date(meeting.occurredAt).toLocaleString("ko-KR")} · {meeting.languages.join(" / ")}
                    {meeting.participants.length > 0 ? ` · ${meeting.participants.join(", ")}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    STATUS_STYLES[meeting.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {STATUS_LABEL[meeting.status] ?? meeting.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
