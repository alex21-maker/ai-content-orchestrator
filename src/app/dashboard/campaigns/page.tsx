import Link from "next/link";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { campaigns, contentItems } from "@/db/schema";
import { count, eq, inArray, desc } from "drizzle-orm";
import { canEdit } from "@/lib/rbac";
import { NewCampaignForm } from "@/components/new-campaign-form";

export default async function CampaignsPage() {
  const org = await requireCurrentOrg();

  const campaignRows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.organizationId, org.organizationId))
    .orderBy(desc(campaigns.createdAt));

  const campaignIds = campaignRows.map((c) => c.id);
  const counts = campaignIds.length
    ? await db
        .select({ campaignId: contentItems.campaignId, value: count() })
        .from(contentItems)
        .where(inArray(contentItems.campaignId, campaignIds))
        .groupBy(contentItems.campaignId)
    : [];
  const countByCampaign = new Map(counts.map((c) => [c.campaignId, c.value]));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">캠페인</h1>
      </div>
      <p className="mt-1 text-sm text-[var(--sub)]">
        브리프에서 시작해 리서치 → 원고 → 검수 → 승인 → 발행까지 이어지는 콘텐츠 파이프라인의 출발점입니다.
      </p>

      {canEdit(org.role) && (
        <div className="mt-4">
          <NewCampaignForm />
        </div>
      )}

      {campaignRows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--sub)]">아직 캠페인이 없습니다. 첫 캠페인을 만들어 보세요.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaignRows.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/dashboard/campaigns/${campaign.id}`}
              className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-4 hover:border-[var(--accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold">{campaign.name}</h2>
                {campaign.status !== "active" && (
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                    {campaign.status}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-xs text-[var(--sub)]">{campaign.brief}</p>
              {campaign.goal && <p className="text-[11px] text-[var(--sub)]">목표: {campaign.goal}</p>}
              <div className="mt-1 text-[11px] font-medium text-[var(--accent)]">
                콘텐츠 {countByCampaign.get(campaign.id) ?? 0}개
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
