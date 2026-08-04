import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { approvals, campaigns, channelVariants, contentItems, contentStatusEvents } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { canTransition, type ContentStatus } from "@/lib/state-machine";

const patchVariantSchema = z.object({
  title: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().min(1).max(40000).optional(),
  hashtags: z.array(z.string().trim().min(1)).max(50).optional(),
  ctaText: z.string().trim().max(500).nullable().optional(),
  altText: z.string().trim().max(1000).nullable().optional(),
});

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Loads the channel variant along with its parent content item, verifying
 * that the content item's campaign belongs to `organizationId` (tenant
 * isolation). Returns null if not found or not owned by this org.
 */
async function loadOwnedVariant(contentItemId: string, variantId: string, organizationId: string) {
  const [row] = await db
    .select({
      variant: channelVariants,
      contentItem: contentItems,
      campaignOrgId: campaigns.organizationId,
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

// PATCH /api/content-items/[id]/variants/[variantId] — edit a channel variant's copy.
// See docs/PRD.md section 6: editing a variant after its parent content item is
// APPROVED must invalidate the existing approval and roll the content item's
// status back. SCHEDULED/PUBLISHING are blocked outright (게시 진행 중).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "채널별 원고를 수정할 권한이 없습니다.");
    const { id: contentItemId, variantId } = await params;

    const owned = await loadOwnedVariant(contentItemId, variantId, org.organizationId);
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { variant, contentItem } = owned;

    if (contentItem.status === "SCHEDULED" || contentItem.status === "PUBLISHING") {
      return NextResponse.json({ error: "게시 진행 중에는 수정할 수 없습니다." }, { status: 409 });
    }

    const patch = patchVariantSchema.parse(await request.json());

    const before = {
      title: variant.title,
      body: variant.body,
      hashtags: variant.hashtags,
      ctaText: variant.ctaText,
      altText: variant.altText,
    };
    const after = {
      title: patch.title !== undefined ? patch.title : before.title,
      body: patch.body !== undefined ? patch.body : before.body,
      hashtags: patch.hashtags !== undefined ? patch.hashtags : before.hashtags,
      ctaText: patch.ctaText !== undefined ? patch.ctaText : before.ctaText,
      altText: patch.altText !== undefined ? patch.altText : before.altText,
    };

    // If the parent content item was already APPROVED, this edit must
    // invalidate any live approval and roll the content item's status back
    // BEFORE the edit itself is saved.
    if (contentItem.status === "APPROVED") {
      const liveApprovals = await db
        .select()
        .from(approvals)
        .where(and(eq(approvals.contentItemId, contentItem.id), isNull(approvals.invalidatedAt)));

      for (const approval of liveApprovals) {
        await db
          .update(approvals)
          .set({ invalidatedAt: new Date() })
          .where(eq(approvals.id, approval.id));
      }

      // APPROVED -> REVIEWING is the correct rollback target (docs/PRD.md
      // section 6: revert to the stage BEFORE READY_FOR_APPROVAL). Probed via
      // canTransition rather than hardcoded, with a defensive fallback in
      // case a future HAPPY_PATH revision removes that edge.
      const rollbackTarget: ContentStatus = canTransition(contentItem.status as ContentStatus, "REVIEWING")
        ? "REVIEWING"
        : "READY_FOR_APPROVAL";

      await db
        .update(contentItems)
        .set({ status: rollbackTarget, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItem.id));

      await db.insert(contentStatusEvents).values({
        contentItemId: contentItem.id,
        fromStatus: contentItem.status as ContentStatus,
        toStatus: rollbackTarget,
        actorType: "system",
        actorId: org.userId,
        reason: "channel_variant edited after approval — approval invalidated",
      });

      await recordAudit({
        organizationId: org.organizationId,
        actorType: "user",
        actorId: org.userId,
        action: "content.approval_invalidated",
        targetType: "content_item",
        targetId: contentItem.id,
        metadata: {
          invalidatedApprovalIds: liveApprovals.map((a) => a.id),
          fromStatus: contentItem.status,
          toStatus: rollbackTarget,
          triggeredByVariantId: variant.id,
        },
      });
    }

    const [updated] = await db
      .update(channelVariants)
      .set({
        title: after.title,
        body: after.body,
        hashtags: after.hashtags,
        ctaText: after.ctaText,
        altText: after.altText,
        version: variant.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(channelVariants.id, variant.id))
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "channel_variant.update",
      targetType: "channel_variant",
      targetId: variant.id,
      metadata: { before, after },
    });

    return NextResponse.json({ channelVariant: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
