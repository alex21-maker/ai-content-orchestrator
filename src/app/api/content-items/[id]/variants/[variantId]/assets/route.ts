import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assets, campaigns, channelVariants, contentItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveAsset } from "@/lib/storage";

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function loadOwnedVariant(contentItemId: string, variantId: string, organizationId: string) {
  const [row] = await db
    .select({
      variant: channelVariants,
      contentItem: contentItems,
    })
    .from(channelVariants)
    .innerJoin(contentItems, eq(channelVariants.contentItemId, contentItems.id))
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(
      and(
        eq(channelVariants.id, variantId),
        eq(channelVariants.contentItemId, contentItemId),
        eq(campaigns.organizationId, organizationId)
      )
    )
    .limit(1);

  return row ?? null;
}

function inferKind(mimeType: string): "image" | "video" {
  return mimeType.startsWith("video/") ? "video" : "image";
}

// POST /api/content-items/[id]/variants/[variantId]/assets — upload a media
// asset (image/video) for a channel variant. multipart/form-data with a
// `file` field. See src/lib/storage.ts for the (dev-only, local filesystem)
// storage implementation this delegates to.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "미디어 자산을 업로드할 권한이 없습니다.");
    const { id: contentItemId, variantId } = await params;

    const owned = await loadOwnedVariant(contentItemId, variantId, org.organizationId);
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { variant, contentItem } = owned;

    if (contentItem.status === "SCHEDULED" || contentItem.status === "PUBLISHING") {
      return NextResponse.json({ error: "게시 진행 중에는 수정할 수 없습니다." }, { status: 409 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
    }

    const { url } = await saveAsset(file, contentItem.id);

    const [created] = await db
      .insert(assets)
      .values({
        channelVariantId: variant.id,
        kind: inferKind(file.type || ""),
        storageUrl: url,
      })
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "asset.upload",
      targetType: "asset",
      targetId: created.id,
      metadata: { channelVariantId: variant.id, storageUrl: url, kind: created.kind, filename: file.name },
    });

    return NextResponse.json({ asset: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
