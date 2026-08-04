import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, contentItems, channelVariants, approvals, contentStatusEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canApprove } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { assertTransition, nextRevisionStatus, type ContentStatus } from "@/lib/state-machine";
import { computeContentHash } from "@/lib/content-hash";
import { selectPostableVariants } from "@/lib/postable-variants";

const approveSchema = z.object({
  decision: z.enum(["approved", "rejected", "revision_requested"]),
  note: z.string().trim().max(4000).optional(),
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

/** Loads the content item + its campaign, scoped to the caller's org. 404 (not 403) on tenant mismatch. */
async function loadOwnedContentItem(contentItemId: string, organizationId: string) {
  const [row] = await db
    .select({ contentItem: contentItems, campaignId: campaigns.id })
    .from(contentItems)
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(and(eq(contentItems.id, contentItemId), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

// POST /api/content-items/[id]/approve — 관리자 승인/반려/수정요청.
// Requires ADMIN+ (canApprove). Only valid from READY_FOR_APPROVAL.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canApprove, "콘텐츠를 승인/반려할 권한이 없습니다 (Admin 이상 필요).");
    const { id } = await params;

    const owned = await loadOwnedContentItem(id, org.organizationId);
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const contentItem = owned.contentItem;

    if (contentItem.status !== "READY_FOR_APPROVAL") {
      return NextResponse.json(
        { error: `승인 대기(READY_FOR_APPROVAL) 상태에서만 처리할 수 있습니다. 현재 상태: ${contentItem.status}` },
        { status: 400 }
      );
    }

    const body = approveSchema.parse(await request.json());

    // Compute the hash of the content as it stands *right now* — this is
    // the version being approved/rejected. Stored on the Approval row so a
    // later publish attempt can re-verify nothing changed since (PRD §6, §8).
    const allVariants = await db
      .select()
      .from(channelVariants)
      .where(eq(channelVariants.contentItemId, contentItem.id));

    // Only the copywriting row per channel is publishable content — the
    // creative row is a text-only production brief. See src/lib/postable-variants.ts.
    const variants = selectPostableVariants(allVariants);

    const contentHash = computeContentHash(
      variants.map((v) => ({
        channel: v.channel,
        title: v.title,
        body: v.body,
        hashtags: v.hashtags,
        ctaText: v.ctaText,
        altText: v.altText,
      }))
    );

    const [approval] = await db
      .insert(approvals)
      .values({
        contentItemId: contentItem.id,
        approvedById: org.userId,
        contentHash,
        decision: body.decision,
        note: body.note ?? null,
      })
      .returning();

    let nextStatus: ContentStatus;
    let newRevisionRound = contentItem.revisionRound;

    if (body.decision === "approved") {
      nextStatus = "APPROVED";
      assertTransition(contentItem.status as ContentStatus, nextStatus);
    } else {
      newRevisionRound = contentItem.revisionRound + 1;
      nextStatus = nextRevisionStatus(newRevisionRound);
      assertTransition(contentItem.status as ContentStatus, nextStatus);
    }

    const [updated] = await db
      .update(contentItems)
      .set({
        status: nextStatus,
        revisionRound: newRevisionRound,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, contentItem.id))
      .returning();

    await db.insert(contentStatusEvents).values({
      contentItemId: contentItem.id,
      fromStatus: contentItem.status,
      toStatus: nextStatus,
      actorType: "user",
      actorId: org.userId,
      reason: body.note ?? (body.decision === "approved" ? "관리자 승인" : `관리자 ${body.decision === "rejected" ? "반려" : "수정 요청"}`),
    });

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: body.decision === "approved" ? "content.approve" : "content.reject",
      targetType: "content_item",
      targetId: contentItem.id,
      metadata: {
        decision: body.decision,
        contentHash,
        note: body.note ?? null,
        revisionRound: newRevisionRound,
        fromStatus: contentItem.status,
        toStatus: nextStatus,
      },
    });

    return NextResponse.json({ contentItem: updated, approval });
  } catch (err) {
    return errorResponse(err);
  }
}
