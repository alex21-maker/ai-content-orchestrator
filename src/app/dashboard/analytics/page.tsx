import Link from "next/link";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { campaigns, contentItems, metricSnapshots } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { MetricsRefreshButton } from "@/components/metrics-refresh-button";

type Row = {
  contentItemId: string;
  contentTitle: string;
  channel: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  clicks: number | null;
  isEstimated: boolean;
  capturedAt: Date;
};

export default async function AnalyticsPage() {
  const org = await requireCurrentOrg();

  // All metric snapshots for content items in this org, newest first — we
  // dedupe to the latest snapshot per (contentItem, channel) below. Joining
  // through campaigns enforces tenant isolation (docs/PRD.md section 8).
  const allSnapshots = await db
    .select({
      contentItemId: metricSnapshots.contentItemId,
      contentTitle: contentItems.title,
      channel: metricSnapshots.channel,
      impressions: metricSnapshots.impressions,
      reach: metricSnapshots.reach,
      likes: metricSnapshots.likes,
      comments: metricSnapshots.comments,
      saves: metricSnapshots.saves,
      shares: metricSnapshots.shares,
      clicks: metricSnapshots.clicks,
      isEstimated: metricSnapshots.isEstimated,
      capturedAt: metricSnapshots.capturedAt,
    })
    .from(metricSnapshots)
    .innerJoin(contentItems, eq(metricSnapshots.contentItemId, contentItems.id))
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(eq(campaigns.organizationId, org.organizationId))
    .orderBy(desc(metricSnapshots.capturedAt));

  const latestByKey = new Map<string, Row>();
  for (const s of allSnapshots) {
    const key = `${s.contentItemId}:${s.channel}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, s);
    }
  }
  const rows = [...latestByKey.values()].sort((a, b) => a.contentTitle.localeCompare(b.contentTitle));

  return (
    <div>
      <h1 className="text-xl font-bold">성과 분석</h1>
      <p className="mt-1 text-sm text-[var(--sub)]">
        게시된 콘텐츠의 채널별 최신 지표 스냅샷입니다.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--sub)]">
          아직 지표 스냅샷이 없습니다. 콘텐츠가 게시되고 나면 이 화면에서 지표를 확인할 수 있습니다.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--sub)]">
                <th className="px-3 py-2 font-semibold">콘텐츠</th>
                <th className="px-3 py-2 font-semibold">채널</th>
                <th className="px-3 py-2 font-semibold text-right">노출</th>
                <th className="px-3 py-2 font-semibold text-right">도달</th>
                <th className="px-3 py-2 font-semibold text-right">좋아요</th>
                <th className="px-3 py-2 font-semibold text-right">댓글</th>
                <th className="px-3 py-2 font-semibold text-right">저장</th>
                <th className="px-3 py-2 font-semibold text-right">공유</th>
                <th className="px-3 py-2 font-semibold text-right">클릭</th>
                <th className="px-3 py-2 font-semibold"></th>
                <th className="px-3 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const isFirstRowForItem = rows.findIndex((x) => x.contentItemId === r.contentItemId) === idx;
                return (
                  <tr key={`${r.contentItemId}:${r.channel}`} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/content/${r.contentItemId}`} className="text-[var(--accent)] hover:underline">
                        {r.contentTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.channel}</td>
                    <td className="px-3 py-2 text-right">{r.impressions ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.reach ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.likes ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.comments ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.saves ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.shares ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.clicks ?? "–"}</td>
                    <td className="px-3 py-2">{r.isEstimated && <span className="mock-badge">MOCK 추정치</span>}</td>
                    <td className="px-3 py-2">
                      {isFirstRowForItem && <MetricsRefreshButton contentItemId={r.contentItemId} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-[var(--sub)]">
        위 지표는 실제 채널 API가 아닌 mock 커넥터가 생성한 값이며, 게시물 ID를 시드로 결정적으로
        계산된 추정치입니다(다시 새로고침해도 같은 게시물은 같은 값을 반환합니다). 성과와 콘텐츠
        형식·채널·소재 간의 인과관계는 이 화면만으로 확정할 수 없는 가설일 뿐이며, 실제 원인 분석에는
        추가 검증이 필요합니다.
      </p>
    </div>
  );
}
