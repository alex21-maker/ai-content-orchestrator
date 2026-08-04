import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import {
  campaigns,
  channelVariants,
  contentItems,
  contentStatusEvents,
  reviewFindings,
  sources,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { canEdit } from "@/lib/rbac";
import { RunAgentsButton } from "@/components/run-agents-button";

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

const RISK_STYLES: Record<string, string> = {
  BLOCKER: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-gray-100 text-gray-700 border-gray-300",
};

const RISK_LABELS: Record<string, string> = {
  BLOCKER: "차단",
  HIGH: "높음",
  MEDIUM: "중간",
  LOW: "낮음",
};

const CHANNEL_ORDER = ["INSTAGRAM", "THREADS", "BLOGGER"] as const;

// Statuses from which the orchestrator can (re-)run — mirrors
// src/lib/agents/orchestrator.ts's ENTRY_STATES.
const AGENT_RUNNABLE_STATUSES = new Set([
  "IDEA",
  "RESEARCHING",
  "DRAFTING",
  "REVIEWING",
  "REVISION_REQUIRED",
  "BLOCKED",
]);

export default async function ContentItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireCurrentOrg();
  const { id } = await params;

  const [row] = await db
    .select({ contentItem: contentItems, campaign: campaigns })
    .from(contentItems)
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(and(eq(contentItems.id, id), eq(campaigns.organizationId, org.organizationId)))
    .limit(1);

  if (!row) notFound();
  const { contentItem, campaign } = row;

  const [variantRows, sourceRows, findingRows, statusEvents] = await Promise.all([
    db.select().from(channelVariants).where(eq(channelVariants.contentItemId, id)).orderBy(asc(channelVariants.channel)),
    db.select().from(sources).where(eq(sources.contentItemId, id)).orderBy(asc(sources.accessedAt)),
    db.select().from(reviewFindings).where(eq(reviewFindings.contentItemId, id)).orderBy(asc(reviewFindings.createdAt)),
    db
      .select()
      .from(contentStatusEvents)
      .where(eq(contentStatusEvents.contentItemId, id))
      .orderBy(asc(contentStatusEvents.createdAt)),
  ]);

  const variantsByChannel = new Map<string, typeof variantRows>();
  for (const v of variantRows) {
    const list = variantsByChannel.get(v.channel) ?? [];
    list.push(v);
    variantsByChannel.set(v.channel, list);
  }

  const editable = canEdit(org.role);
  const canRunAgents = editable && AGENT_RUNNABLE_STATUSES.has(contentItem.status);

  return (
    <div>
      <Link href={`/dashboard/campaigns/${campaign.id}`} className="text-xs text-[var(--sub)] hover:text-[var(--accent)]">
        ← {campaign.name}
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{contentItem.title}</h1>
          {contentItem.coreIdea && <p className="mt-1 text-sm text-[var(--sub)]">{contentItem.coreIdea}</p>}
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                STATUS_STYLES[contentItem.status] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {contentItem.status}
            </span>
            <span className="text-[11px] text-[var(--sub)]">수정 라운드: {contentItem.revisionRound} / 3</span>
            <span className="text-[11px] text-[var(--sub)]">버전: v{contentItem.version}</span>
          </div>
        </div>
        {editable && (
          <div className="flex flex-col items-end gap-1">
            {canRunAgents ? (
              <RunAgentsButton contentItemId={contentItem.id} />
            ) : (
              <span className="text-[11px] text-[var(--sub)]">
                현재 상태({contentItem.status})에서는 에이전트를 실행할 수 없습니다.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Channel variants, grouped by channel */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-[var(--sub)] uppercase tracking-wide">채널별 콘텐츠</h2>
        {variantRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--sub)]">
            아직 생성된 채널별 원고가 없습니다. 에이전트를 실행하면 인스타그램/쓰레드/블로거 원고와 크리에이티브 브리프가 생성됩니다.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            {CHANNEL_ORDER.filter((c) => variantsByChannel.has(c)).map((channel) => (
              <div key={channel} className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">{channel}</p>
                {(variantsByChannel.get(channel) ?? []).map((v) => (
                  <div key={v.id} className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sub)]">
                        {v.createdBy === "agent:creative" ? "크리에이티브 브리프" : "원고"}
                      </span>
                      <span className="text-[10px] text-[var(--sub)]">v{v.version}</span>
                    </div>
                    {v.title && <p className="mt-1 font-semibold">{v.title}</p>}
                    <p className="mt-1 whitespace-pre-wrap text-[var(--ink)]">{v.body}</p>
                    {v.hashtags.length > 0 && (
                      <p className="mt-2 text-xs text-[var(--sub)]">{v.hashtags.map((h) => `#${h}`).join(" ")}</p>
                    )}
                    {v.ctaText && <p className="mt-2 text-xs italic text-[var(--sub)]">CTA: {v.ctaText}</p>}
                    {v.altText && <p className="mt-1 text-[11px] text-[var(--sub)]">alt: {v.altText}</p>}
                    <Link
                      href={`/dashboard/content/${contentItem.id}/variants/${v.id}/edit`}
                      className="mt-2 inline-block text-[11px] text-[var(--accent)] hover:underline"
                    >
                      편집
                    </Link>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sources */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-[var(--sub)] uppercase tracking-wide">자료 출처</h2>
        {sourceRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--sub)]">등록된 출처가 없습니다.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {sourceRows.map((s) => (
              <li key={s.id} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs">
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent)] underline">
                  {s.label}
                </a>
                {typeof s.confidence === "number" && (
                  <span className="ml-2 text-[10px] text-[var(--sub)]">신뢰도 {s.confidence.toFixed(2)}</span>
                )}
                {s.isStale && (
                  <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                    신뢰도 낮음/불명확
                  </span>
                )}
                {s.keyClaim && <p className="mt-0.5 text-[var(--sub)]">{s.keyClaim}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Review findings */}
      <section className="mt-8">
        <h2 className="text-sm font-bold text-[var(--sub)] uppercase tracking-wide">품질검수 결과</h2>
        {findingRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--sub)]">발견된 위험 요소가 없습니다.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {findingRows.map((f) => (
              <li
                key={f.id}
                className={`rounded-md border px-3 py-2 text-xs ${RISK_STYLES[f.riskLevel] ?? RISK_STYLES.LOW}`}
              >
                <span className="font-bold">[{RISK_LABELS[f.riskLevel] ?? f.riskLevel}]</span> {f.category}: {f.description}
                {f.suggestion && <span className="block text-[11px] opacity-80">제안: {f.suggestion}</span>}
                {f.resolved && <span className="ml-1 text-[10px] opacity-70">(해결됨)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Status history timeline */}
      <section className="mt-8 mb-4">
        <h2 className="text-sm font-bold text-[var(--sub)] uppercase tracking-wide">상태 변경 이력</h2>
        {statusEvents.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--sub)]">아직 상태 변경 이력이 없습니다.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2 border-l-2 border-[var(--line)] pl-4">
            {statusEvents.map((e) => (
              <li key={e.id} className="text-xs">
                <p>
                  <span className="text-[var(--sub)]">{e.fromStatus ?? "—"} →</span>{" "}
                  <span className="font-semibold">{e.toStatus}</span>{" "}
                  <span className="text-[10px] text-[var(--sub)]">
                    (
                    {e.actorId?.startsWith(`${e.actorType}:`)
                      ? e.actorId
                      : `${e.actorType}${e.actorId ? `:${e.actorId}` : ""}`}
                    )
                  </span>
                </p>
                {e.reason && <p className="text-[var(--sub)]">{e.reason}</p>}
                <p className="text-[10px] text-[var(--sub)]">{new Date(e.createdAt).toLocaleString("ko-KR")}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
