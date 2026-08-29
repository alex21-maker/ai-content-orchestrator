import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { meetingSlackDeliveries, meetingSummaries } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { canEdit } from "@/lib/rbac";
import { loadOwnedMeeting } from "@/lib/meetings";
import type { MeetingActionItem, MeetingStatement } from "@/lib/agents/meeting-analysis";
import { MeetingRecorder } from "@/components/meeting-recorder";
import { MeetingTranscriptForm } from "@/components/meeting-transcript-form";
import { MeetingAnalyzeButton } from "@/components/meeting-analyze-button";
import { MeetingSlackSendButton } from "@/components/meeting-slack-send-button";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "녹음/회의록 대기",
  TRANSCRIBED: "회의록 등록됨",
  ANALYZED: "분석 완료",
  PUBLISHED: "Slack 전송됨",
  FAILED: "분석 실패",
};

function StatementList({ items, emptyLabel }: { items: MeetingStatement[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-xs text-[var(--sub)]">{emptyLabel}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((s, i) => (
        <li key={i} className="text-sm">
          {s.speaker && <span className="font-semibold text-[var(--accent)]">{s.speaker}: </span>}
          {s.text}
        </li>
      ))}
    </ul>
  );
}

function ActionItemList({ items }: { items: MeetingActionItem[] }) {
  if (items.length === 0) return <p className="text-xs text-[var(--sub)]">액션 아이템 없음</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((s, i) => (
        <li key={i} className="text-sm">
          {s.ownerGuess && (
            <span className="mr-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
              {s.ownerGuess}
            </span>
          )}
          {s.text}
        </li>
      ))}
    </ul>
  );
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireCurrentOrg();
  const { id } = await params;

  const meeting = await loadOwnedMeeting(id, org.organizationId);
  if (!meeting) notFound();

  const [summaryRow] = await db.select().from(meetingSummaries).where(eq(meetingSummaries.meetingId, id)).limit(1);
  const deliveries = await db
    .select()
    .from(meetingSlackDeliveries)
    .where(eq(meetingSlackDeliveries.meetingId, id))
    .orderBy(desc(meetingSlackDeliveries.occurredAt));

  const editable = canEdit(org.role);
  const languageBreakdown = summaryRow?.languageBreakdown as Record<string, number> | undefined;

  return (
    <div>
      <Link href="/dashboard/meetings" className="text-xs text-[var(--sub)] hover:text-[var(--accent)]">
        ← 회의 목록
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{meeting.title}</h1>
          <p className="mt-0.5 text-xs text-[var(--sub)]">
            {new Date(meeting.occurredAt).toLocaleString("ko-KR")} · {meeting.languages.join(" / ")}
            {meeting.participants.length > 0 ? ` · ${meeting.participants.join(", ")}` : ""}
          </p>
        </div>
        <span className="mock-badge shrink-0">{STATUS_LABEL[meeting.status] ?? meeting.status}</span>
      </div>

      {editable && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">녹음 / 회의록</h2>
          <MeetingRecorder meetingId={meeting.id} />
          <MeetingTranscriptForm meetingId={meeting.id} initialText={meeting.transcriptText} />
          {meeting.audioAssetUrl && (
            <p className="text-[11px] text-[var(--sub)]">
              첨부된 녹음: <a href={meeting.audioAssetUrl} className="text-[var(--accent)] underline">다운로드</a>
            </p>
          )}
          <div>
            <MeetingAnalyzeButton meetingId={meeting.id} disabled={!meeting.transcriptText} />
          </div>
        </div>
      )}

      {summaryRow && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">분석 결과</h2>
            {editable && <MeetingSlackSendButton meetingId={meeting.id} />}
          </div>

          {languageBreakdown && (
            <p className="text-xs text-[var(--sub)]">
              한국어 {languageBreakdown.ko ?? 0}건 · 中文 {languageBreakdown.zh ?? 0}건 · 병행 {languageBreakdown.mixed ?? 0}건 · 미분류{" "}
              {languageBreakdown.other ?? 0}건 · 신뢰도 {summaryRow.confidence.toFixed(2)}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">🇰🇷 한국어 핵심 발언</h3>
              <div className="mt-2">
                <StatementList items={summaryRow.keyStatementsKo as MeetingStatement[]} emptyLabel="한국어 발언 없음" />
              </div>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">🇨🇳 中文关键发言</h3>
              <div className="mt-2">
                <StatementList items={summaryRow.keyStatementsZh as MeetingStatement[]} emptyLabel="无中文发言" />
              </div>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">✅ 결정 사항</h3>
              <div className="mt-2">
                <StatementList items={summaryRow.decisions as MeetingStatement[]} emptyLabel="결정 사항 없음" />
              </div>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">🔧 액션 아이템</h3>
              <div className="mt-2">
                <ActionItemList items={summaryRow.actionItems as MeetingActionItem[]} />
              </div>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white p-4 sm:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">⚠️ 리스크</h3>
              <div className="mt-2">
                <StatementList items={summaryRow.meetingRisks as MeetingStatement[]} emptyLabel="리스크 없음" />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--sub)]">
            규칙 기반 추출 요약(Phase 1)입니다 — 실제 LLM 의미 요약·번역이 아니며, 모두 원문 발췌입니다. 공유 전 검토하세요.
          </p>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold">Slack 전송 기록</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {deliveries.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-xs"
              >
                <span>
                  {new Date(d.occurredAt).toLocaleString("ko-KR")} · {d.mode}
                  {d.errorMessage ? ` · ${d.errorMessage}` : ""}
                </span>
                <span className={d.succeeded ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
                  {d.succeeded ? "성공" : "실패"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
