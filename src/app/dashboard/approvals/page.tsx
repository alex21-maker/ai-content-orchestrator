import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { campaigns, contentItems, channelVariants, sources, reviewFindings } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ApprovalDecisionButtons } from "@/components/approval-decision-buttons";
import { PublishMockButton } from "@/components/publish-mock-button";
import { selectPostableVariants } from "@/lib/postable-variants";

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

type ContentItemRow = typeof contentItems.$inferSelect;

async function loadItemsByStatus(organizationId: string, status: "READY_FOR_APPROVAL" | "APPROVED") {
  const rows = await db
    .select({ contentItem: contentItems, campaignName: campaigns.name, campaignId: campaigns.id })
    .from(contentItems)
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(and(eq(campaigns.organizationId, organizationId), eq(contentItems.status, status)))
    .orderBy(desc(contentItems.updatedAt));
  return rows;
}

async function loadDetailsFor(itemIds: string[]) {
  if (itemIds.length === 0) {
    return { variantsByItem: new Map(), sourcesByItem: new Map(), findingsByItem: new Map() };
  }

  const [variantRows, sourceRows, findingRows] = await Promise.all([
    db.select().from(channelVariants).where(inArray(channelVariants.contentItemId, itemIds)),
    db.select().from(sources).where(inArray(sources.contentItemId, itemIds)),
    db.select().from(reviewFindings).where(inArray(reviewFindings.contentItemId, itemIds)),
  ]);

  // Only show the postable (copywriting) row per channel here — the
  // creative row is a text-only production brief, not the actual post copy
  // an admin is approving. See src/lib/postable-variants.ts.
  const variantsByItem = new Map<string, typeof variantRows>();
  for (const v of selectPostableVariants(variantRows)) {
    const list = variantsByItem.get(v.contentItemId) ?? [];
    list.push(v);
    variantsByItem.set(v.contentItemId, list);
  }
  const sourcesByItem = new Map<string, typeof sourceRows>();
  for (const s of sourceRows) {
    const list = sourcesByItem.get(s.contentItemId) ?? [];
    list.push(s);
    sourcesByItem.set(s.contentItemId, list);
  }
  const findingsByItem = new Map<string, typeof findingRows>();
  for (const f of findingRows) {
    const list = findingsByItem.get(f.contentItemId) ?? [];
    list.push(f);
    findingsByItem.set(f.contentItemId, list);
  }

  return { variantsByItem, sourcesByItem, findingsByItem };
}

export default async function ApprovalsPage() {
  const org = await requireCurrentOrg();

  const [pending, readyToPublish] = await Promise.all([
    loadItemsByStatus(org.organizationId, "READY_FOR_APPROVAL"),
    loadItemsByStatus(org.organizationId, "APPROVED"),
  ]);

  const allIds = [...pending, ...readyToPublish].map((r) => r.contentItem.id);
  const { variantsByItem, sourcesByItem, findingsByItem } = await loadDetailsFor(allIds);

  return (
    <div>
      <h1 className="text-xl font-bold">승인 대기</h1>
      <p className="mt-1 text-sm text-[var(--sub)]">
        관리자(Admin 이상)만 승인/반려/배포할 수 있습니다. 배포는 항상 mock connector로만 시뮬레이션됩니다.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-[var(--sub)] uppercase tracking-wide">검토 대기 ({pending.length})</h2>
        {pending.length === 0 && <p className="mt-3 text-sm text-[var(--sub)]">승인 대기 중인 콘텐츠가 없습니다.</p>}
        <div className="mt-3 flex flex-col gap-4">
          {pending.map((row) => (
            <ContentReviewCard
              key={row.contentItem.id}
              item={row.contentItem}
              campaignName={row.campaignName}
              variants={variantsByItem.get(row.contentItem.id) ?? []}
              sourceRows={sourcesByItem.get(row.contentItem.id) ?? []}
              findings={findingsByItem.get(row.contentItem.id) ?? []}
            />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-bold text-[var(--sub)] uppercase tracking-wide">배포 대기 ({readyToPublish.length})</h2>
        {readyToPublish.length === 0 && <p className="mt-3 text-sm text-[var(--sub)]">배포 대기 중인 콘텐츠가 없습니다.</p>}
        <div className="mt-3 flex flex-col gap-4">
          {readyToPublish.map((row) => (
            <div key={row.contentItem.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--sub)]">{row.campaignName}</p>
                  <h3 className="font-semibold">{row.contentItem.title}</h3>
                  <span className="mock-badge mt-1">승인 완료 · 배포 전 (MOCK)</span>
                </div>
                <PublishMockButton contentItemId={row.contentItem.id} />
              </div>
              <ChannelVariantList variants={variantsByItem.get(row.contentItem.id) ?? []} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChannelVariantList({ variants }: { variants: (typeof channelVariants.$inferSelect)[] }) {
  if (variants.length === 0) {
    return <p className="mt-3 text-xs text-[var(--sub)]">채널별 원고가 없습니다.</p>;
  }
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {variants.map((v) => (
        <div key={v.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]">{v.channel}</p>
          {v.title && <p className="mt-1 font-semibold">{v.title}</p>}
          <p className="mt-1 whitespace-pre-wrap text-[var(--ink)]">{v.body}</p>
          {v.hashtags.length > 0 && (
            <p className="mt-1 text-xs text-[var(--sub)]">{v.hashtags.map((h) => `#${h}`).join(" ")}</p>
          )}
          {v.ctaText && <p className="mt-1 text-xs italic text-[var(--sub)]">CTA: {v.ctaText}</p>}
          {v.altText && <p className="mt-1 text-[11px] text-[var(--sub)]">alt: {v.altText}</p>}
        </div>
      ))}
    </div>
  );
}

function ContentReviewCard({
  item,
  campaignName,
  variants,
  sourceRows,
  findings,
}: {
  item: ContentItemRow;
  campaignName: string;
  variants: (typeof channelVariants.$inferSelect)[];
  sourceRows: (typeof sources.$inferSelect)[];
  findings: (typeof reviewFindings.$inferSelect)[];
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[var(--sub)]">{campaignName}</p>
          <h3 className="font-semibold">{item.title}</h3>
          {item.coreIdea && <p className="mt-1 text-xs text-[var(--sub)]">{item.coreIdea}</p>}
          {item.revisionRound > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">수정 라운드: {item.revisionRound} / 3</p>
          )}
        </div>
        <ApprovalDecisionButtons contentItemId={item.id} />
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-[var(--sub)]">채널별 미리보기 / 원고 · 해시태그</p>
        <ChannelVariantList variants={variants} />
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-[var(--sub)]">자료 출처</p>
        {sourceRows.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--sub)]">등록된 출처가 없습니다.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {sourceRows.map((s) => (
              <li key={s.id} className="text-xs">
                <a href={s.url} target="_blank" rel="noreferrer" className="underline text-[var(--accent)]">
                  {s.label}
                </a>
                {s.keyClaim && <span className="text-[var(--sub)]"> — {s.keyClaim}</span>}
                {s.isStale && <span className="ml-1 text-[10px] text-red-600">(오래된 자료)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-[var(--sub)]">품질검수 결과 / 위험 경고</p>
        {findings.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--sub)]">발견된 위험 요소가 없습니다.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {findings.map((f) => (
              <li
                key={f.id}
                className={`rounded-md border px-2 py-1 text-xs ${RISK_STYLES[f.riskLevel] ?? RISK_STYLES.LOW}`}
              >
                <span className="font-bold">[{RISK_LABELS[f.riskLevel] ?? f.riskLevel}]</span> {f.category}:{" "}
                {f.description}
                {f.suggestion && <span className="block text-[11px] opacity-80">제안: {f.suggestion}</span>}
                {f.resolved && <span className="ml-1 text-[10px] opacity-70">(해결됨)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
