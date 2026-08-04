import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  campaigns,
  contentItems,
  channelVariants,
  approvals,
  contentStatusEvents,
  publicationJobs,
  publicationResults,
} from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canApprove } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { assertTransition, type ContentStatus } from "@/lib/state-machine";
import { computeContentHash } from "@/lib/content-hash";
import { getConnector } from "@/lib/connectors/mock-connector";
import type { ChannelName } from "@/lib/connectors/types";
import { selectPostableVariants } from "@/lib/postable-variants";

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

/**
 * Postgres unique_violation (23505) — used to detect a duplicate idempotency
 * key. Drizzle wraps the underlying pg driver error in `.cause`, so check
 * both the error itself and one level of `.cause` rather than assuming the
 * code sits directly on the caught error.
 */
function isUniqueViolation(err: unknown): boolean {
  const hasCode23505 = (e: unknown): boolean =>
    Boolean(e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505");
  if (hasCode23505(err)) return true;
  if (err && typeof err === "object" && "cause" in err) {
    return hasCode23505((err as { cause?: unknown }).cause);
  }
  return false;
}

type ChannelResult = {
  channel: string;
  succeeded: boolean;
  skipped?: boolean;
  externalPostId?: string;
  externalUrl?: string;
  error?: string;
};

// POST /api/content-items/[id]/publish — (mock) 배포. Requires ADMIN+, requires
// APPROVED status and a valid, hash-matching, non-invalidated Approval.
// Never calls a real external API — always MockConnector (PRD §9).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canApprove, "콘텐츠를 배포할 권한이 없습니다 (Admin 이상 필요).");
    const { id } = await params;

    const owned = await loadOwnedContentItem(id, org.organizationId);
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let contentItem = owned.contentItem;

    if (contentItem.status !== "APPROVED") {
      return NextResponse.json(
        { error: `승인 완료(APPROVED) 상태에서만 배포할 수 있습니다. 현재 상태: ${contentItem.status}` },
        { status: 400 }
      );
    }

    // Latest non-invalidated "approved" approval for this content item.
    const [approval] = await db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.contentItemId, contentItem.id),
          eq(approvals.decision, "approved"),
          isNull(approvals.invalidatedAt)
        )
      )
      .orderBy(desc(approvals.createdAt))
      .limit(1);

    if (!approval) {
      // Should not normally happen if status is APPROVED, but the PRD's
      // security model requires we never publish without a valid approval
      // record on file — defend against it explicitly.
      return NextResponse.json(
        { error: "유효한 승인 기록을 찾을 수 없습니다 — 재승인이 필요합니다." },
        { status: 409 }
      );
    }

    const allVariants = await db
      .select()
      .from(channelVariants)
      .where(eq(channelVariants.contentItemId, contentItem.id));

    // Only the copywriting row per channel is publishable content — the
    // creative row is a text-only production brief, never posted as-is.
    // See src/lib/postable-variants.ts.
    const currentVariants = selectPostableVariants(allVariants);

    const currentHash = computeContentHash(
      currentVariants.map((v) => ({
        channel: v.channel,
        title: v.title,
        body: v.body,
        hashtags: v.hashtags,
        ctaText: v.ctaText,
        altText: v.altText,
      }))
    );

    if (currentHash !== approval.contentHash) {
      // Content changed since approval — invalidate it and bounce the item
      // back so it must be re-approved. This is the single most important
      // invariant in the system (PRD §6, §8).
      await db.update(approvals).set({ invalidatedAt: new Date() }).where(eq(approvals.id, approval.id));

      // Target REVIEWING — state-machine.ts's APPROVED transitions now allow
      // ["SCHEDULED", "REVIEWING"] (docs/PRD.md section 6: revert to the
      // stage BEFORE READY_FOR_APPROVAL). Matches the same rollback target
      // used by the variant-edit route for the same invalidation case.
      const fallbackStatus: ContentStatus = "REVIEWING";
      assertTransition(contentItem.status as ContentStatus, fallbackStatus);

      const [reverted] = await db
        .update(contentItems)
        .set({ status: fallbackStatus, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItem.id))
        .returning();

      await db.insert(contentStatusEvents).values({
        contentItemId: contentItem.id,
        fromStatus: contentItem.status,
        toStatus: fallbackStatus,
        actorType: "user",
        actorId: org.userId,
        reason: "승인 이후 콘텐츠 변경 감지 — 승인 무효화",
      });

      await recordAudit({
        organizationId: org.organizationId,
        actorType: "user",
        actorId: org.userId,
        action: "content.approval_invalidated",
        targetType: "content_item",
        targetId: contentItem.id,
        metadata: { approvalId: approval.id, oldHash: approval.contentHash, newHash: currentHash },
      });

      return NextResponse.json(
        { error: "콘텐츠가 승인 이후 변경되었습니다 — 재승인이 필요합니다", contentItem: reverted },
        { status: 409 }
      );
    }

    // APPROVED → SCHEDULED → PUBLISHING (collapsed into one synchronous mock
    // request per PRD §4's note on Vercel function lifetime; one status
    // event per hop for a full audit trail).
    assertTransition(contentItem.status as ContentStatus, "SCHEDULED");
    await db.insert(contentStatusEvents).values({
      contentItemId: contentItem.id,
      fromStatus: contentItem.status,
      toStatus: "SCHEDULED",
      actorType: "user",
      actorId: org.userId,
      reason: "(mock) 배포 시작",
    });

    assertTransition("SCHEDULED", "PUBLISHING");
    await db.insert(contentStatusEvents).values({
      contentItemId: contentItem.id,
      fromStatus: "SCHEDULED",
      toStatus: "PUBLISHING",
      actorType: "user",
      actorId: org.userId,
      reason: "(mock) 채널별 게시 진행 중",
    });

    const [publishing] = await db
      .update(contentItems)
      .set({ status: "PUBLISHING", updatedAt: new Date() })
      .where(eq(contentItems.id, contentItem.id))
      .returning();
    contentItem = publishing;

    const results: ChannelResult[] = [];

    for (const variant of currentVariants) {
      const channel = variant.channel as ChannelName;
      const idempotencyKey = `${contentItem.id}:${channel}:${approval.id}`;

      let job;
      try {
        [job] = await db
          .insert(publicationJobs)
          .values({
            contentItemId: contentItem.id,
            channel,
            approvalId: approval.id,
            idempotencyKey,
            status: "RUNNING",
            attempt: 1,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Already published (or in flight) for this exact approval — skip
          // re-publishing rather than crashing or double-posting.
          const [existingJob] = await db
            .select()
            .from(publicationJobs)
            .where(eq(publicationJobs.idempotencyKey, idempotencyKey))
            .limit(1);
          const [latestResult] = existingJob
            ? await db
                .select()
                .from(publicationResults)
                .where(eq(publicationResults.publicationJobId, existingJob.id))
                .orderBy(desc(publicationResults.occurredAt))
                .limit(1)
            : [];
          results.push({
            channel,
            succeeded: existingJob?.status === "SUCCEEDED",
            skipped: true,
            externalPostId: latestResult?.externalPostId ?? undefined,
            externalUrl: latestResult?.externalUrl ?? undefined,
            error: existingJob?.lastError ?? undefined,
          });
          continue;
        }
        throw err;
      }

      const connector = getConnector(channel);
      const publishResult = await connector.publish({
        channel,
        title: variant.title ?? undefined,
        body: variant.body,
        hashtags: variant.hashtags,
        imageUrl: undefined,
        idempotencyKey,
      });

      await db.insert(publicationResults).values({
        publicationJobId: job.id,
        mode: "MOCK",
        succeeded: publishResult.succeeded,
        externalPostId: publishResult.externalPostId ?? null,
        externalUrl: publishResult.externalUrl ?? null,
        requestSummary: publishResult.requestSummary,
        responseSummary: publishResult.responseSummary,
      });

      await db
        .update(publicationJobs)
        .set({
          status: publishResult.succeeded ? "SUCCEEDED" : "FAILED",
          lastError: publishResult.error ?? null,
          updatedAt: new Date(),
        })
        .where(eq(publicationJobs.id, job.id));

      results.push({
        channel,
        succeeded: publishResult.succeeded,
        externalPostId: publishResult.externalPostId,
        externalUrl: publishResult.externalUrl,
        error: publishResult.error,
      });
    }

    const allSucceeded = results.every((r) => r.succeeded);
    const finalStatus: ContentStatus = allSucceeded ? "PUBLISHED" : "FAILED";
    assertTransition("PUBLISHING", finalStatus);

    const [finalItem] = await db
      .update(contentItems)
      .set({ status: finalStatus, updatedAt: new Date() })
      .where(eq(contentItems.id, contentItem.id))
      .returning();

    await db.insert(contentStatusEvents).values({
      contentItemId: contentItem.id,
      fromStatus: "PUBLISHING",
      toStatus: finalStatus,
      actorType: "user",
      actorId: org.userId,
      reason: allSucceeded ? "(mock) 전 채널 게시 성공" : "(mock) 일부 채널 게시 실패",
    });

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "content.publish_attempt",
      targetType: "content_item",
      targetId: contentItem.id,
      metadata: { mode: "MOCK", approvalId: approval.id, results },
    });

    return NextResponse.json({ contentItem: finalItem, results });
  } catch (err) {
    return errorResponse(err);
  }
}
