import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { db } from "@/db";
import { assets, campaigns, channelVariants, contentItems } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { VariantEditForm } from "@/components/variant-edit-form";
import { VariantAssetUpload } from "@/components/variant-asset-upload";

export default async function VariantEditPage({
  params,
}: {
  params: Promise<{ id: string; variantId: string }>;
}) {
  const org = await requireCurrentOrg();
  const { id: contentItemId, variantId } = await params;

  const [row] = await db
    .select({ variant: channelVariants, contentItem: contentItems })
    .from(channelVariants)
    .innerJoin(contentItems, eq(channelVariants.contentItemId, contentItems.id))
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(
      and(
        eq(channelVariants.id, variantId),
        eq(channelVariants.contentItemId, contentItemId),
        eq(campaigns.organizationId, org.organizationId)
      )
    )
    .limit(1);

  if (!row) notFound();
  const { variant, contentItem } = row;

  const variantAssets = await db
    .select()
    .from(assets)
    .where(eq(assets.channelVariantId, variant.id))
    .orderBy(desc(assets.createdAt));

  const isApproved = contentItem.status === "APPROVED";
  const isLocked = contentItem.status === "SCHEDULED" || contentItem.status === "PUBLISHING";

  return (
    <div>
      <p className="text-xs text-[var(--sub)]">
        <Link href={`/dashboard/content/${contentItem.id}`} className="hover:underline">
          ← {contentItem.title}
        </Link>
      </p>
      <h1 className="mt-1 text-xl font-bold">
        {variant.channel} 원고 편집 <span className="text-sm font-normal text-[var(--sub)]">v{variant.version}</span>
      </h1>
      <p className="mt-1 text-xs text-[var(--sub)]">콘텐츠 상태: {contentItem.status}</p>

      {isApproved && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          저장 시 기존 승인이 무효화됩니다.
        </div>
      )}

      {isLocked ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          게시 진행 중({contentItem.status})에는 이 원고를 수정할 수 없습니다.
        </div>
      ) : (
        <div className="mt-6">
          <VariantEditForm
            contentItemId={contentItem.id}
            variantId={variant.id}
            initial={{
              title: variant.title ?? "",
              body: variant.body,
              hashtags: variant.hashtags,
              ctaText: variant.ctaText ?? "",
              altText: variant.altText ?? "",
            }}
          />

          {variant.channel === "INSTAGRAM" && (
            <div className="mt-6 rounded-xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-semibold text-[var(--sub)]">
                이미지 (인스타그램은 게시 전 이미지가 필요합니다)
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {variantAssets.map((a) => (
                  <div key={a.id} className="w-24 overflow-hidden rounded-md border border-[var(--line)]">
                    {a.kind === "video" ? (
                      <video src={a.storageUrl} className="h-24 w-24 object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.storageUrl} alt={variant.altText ?? ""} className="h-24 w-24 object-cover" />
                    )}
                  </div>
                ))}
                {variantAssets.length === 0 && <p className="text-xs text-[var(--sub)]">업로드된 이미지가 없습니다.</p>}
              </div>
              <div className="mt-3">
                <VariantAssetUpload contentItemId={contentItem.id} variantId={variant.id} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
