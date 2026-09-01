import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { campaigns, contentItems } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { canEdit } from "@/lib/rbac";
import { NewContentItemForm } from "@/components/new-content-item-form";
import { ArchiveCampaignButton } from "@/components/archive-campaign-button";
import { getMeetingTimelineForCampaign } from "@/lib/meeting-timeline";

const STATUS_STYLES: Record<string, string> = {
  IDEA: "bg-gray-100 text-gray-700",
  RESEARCHING: "bg-blue-100 text-blue-700",
  DRAFTING: "bg-blue-100 text-blue-700",
  REVIEWING: "bg-amber-100 text-amber-800",
  REVISION_REQUIRED: "bg-amber-100 text-amber-800",
  READY_FOR_APPROVAL: "bg-purple-100 text-purple-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  SCHEDULED: "bg-emerald-100 text-emerald-700",
  PUBLISHING: "bg-emerald-100 text-emerald-700",
  PUBLISHED: "bg-[var(--accent-soft)] text-[var(--accent)]",
  MONITORING: "bg-[var(--accent-soft)] text-[var(--accent)]",
  ANALYZED: "bg-[var(--accent-soft)] text-[var(--accent)]",
  BLOCKED: "bg-red-100 text-red-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELED: "bg-gray-100 text-gray-500",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireCurrentOrg();
  const { id } = await params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, org.organizationId)))
    .limit(1);

  if (!campaign) notFound();

  const items = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.campaignId, campaign.id))
    .orderBy(desc(contentItems.createdAt));

  const meetingTimeline = await getMeetingTimelineForCampaign(campaign.name);

  const editable = canEdit(org.role);

  return (
    <div>
      <Link href="/dashboard/campaigns" className="text-xs text-[var(--sub)] hover:text-[var(--accent)]">
        ← 캠페인 목록
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{campaign.name}</h1>
          <p className="mt-0.5 text-xs text-[var(--sub)]">
            상태: {campaign.status}
            {campaign.funnelStage ? ` · 퍼널 단계: ${campaign.funnelStage}` : ""}
          </p>
        </div>
        {editable && <ArchiveCampaignButton campaignId={campaign.id} archived={campaign.status === "archived"} />}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">브리프</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{campaign.brief}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">목표</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{campaign.goal || "—"}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white p-4 sm:col-span-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">타겟 페르소나</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{campaign.targetPersona || "—"}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold">회의 타임라인</h2>
        {meetingTimeline.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--sub)]">
            아직 연결된 회의록이 없습니다. 회의록 자동화(note.lablab.cloud)에서 프로젝트명을 &ldquo;{campaign.name}&rdquo;로
            입력하면 자동으로 연결됩니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {meetingTimeline.map((meeting) => (
              <li key={meeting.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                <p className="text-xs text-[var(--sub)]">
                  {new Date(meeting.meetingAt).toLocaleString("ko-KR")}
                  {meeting.participants.length > 0 && ` · 참석자: ${meeting.participants.join(", ")}`}
                </p>
                <p className="mt-1.5 text-sm">{meeting.summaryKo || "요약 없음"}</p>
                <a
                  href={meeting.driveLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-xs text-[var(--accent)]"
                >
                  원본 녹음 (Google Drive)
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-bold">콘텐츠 아이디어</h2>
      </div>

      {editable && (
        <div className="mt-3">
          <NewContentItemForm campaignId={campaign.id} />
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--sub)]">아직 콘텐츠 아이디어가 없습니다.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/content/${item.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white px-4 py-3 hover:border-[var(--accent)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.coreIdea && <p className="mt-0.5 truncate text-xs text-[var(--sub)]">{item.coreIdea}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    STATUS_STYLES[item.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {item.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
