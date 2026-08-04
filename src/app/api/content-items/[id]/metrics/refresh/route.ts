import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, contentItems, metricSnapshots, publicationJobs, publicationResults } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { getConnector } from "@/lib/connectors/mock-connector";
import type { ChannelName } from "@/lib/connectors/types";

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

async function loadOwnedContentItem(contentItemId: string, organizationId: string) {
  const [row] = await db
    .select({ contentItem: contentItems })
    .from(contentItems)
    .innerJoin(campaigns, eq(contentItems.campaignId, campaigns.id))
    .where(and(eq(contentItems.id, contentItemId), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  return row?.contentItem ?? null;
}

// POST /api/content-items/[id]/metrics/refresh — pull fresh mock metrics for
// every channel of this content item that has actually been published (a
// SUCCEEDED publication job with a recorded externalPostId). Only published
// content has metrics to fetch — see docs/PRD.md section 3 step 6.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "지표를 갱신할 권한이 없습니다.");
    const { id: contentItemId } = await params;

    const contentItem = await loadOwnedContentItem(contentItemId, org.organizationId);
    if (!contentItem) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const publishedRows = await db
      .select({
        channel: publicationJobs.channel,
        externalPostId: publicationResults.externalPostId,
        occurredAt: publicationResults.occurredAt,
      })
      .from(publicationJobs)
      .innerJoin(publicationResults, eq(publicationResults.publicationJobId, publicationJobs.id))
      .where(
        and(
          eq(publicationJobs.contentItemId, contentItem.id),
          eq(publicationJobs.status, "SUCCEEDED"),
          isNotNull(publicationResults.externalPostId)
        )
      )
      .orderBy(desc(publicationResults.occurredAt));

    // Dedupe to the most recent successful publication per channel.
    const latestByChannel = new Map<ChannelName, string>();
    for (const row of publishedRows) {
      if (!row.externalPostId) continue;
      if (!latestByChannel.has(row.channel as ChannelName)) {
        latestByChannel.set(row.channel as ChannelName, row.externalPostId);
      }
    }

    const snapshots = [];
    for (const [channel, externalPostId] of latestByChannel) {
      const metrics = await getConnector(channel).fetchMetrics(externalPostId);
      const [snapshot] = await db
        .insert(metricSnapshots)
        .values({
          contentItemId: contentItem.id,
          channel,
          impressions: metrics.impressions ?? null,
          reach: metrics.reach ?? null,
          views: metrics.views ?? null,
          likes: metrics.likes ?? null,
          comments: metrics.comments ?? null,
          saves: metrics.saves ?? null,
          shares: metrics.shares ?? null,
          clicks: metrics.clicks ?? null,
          conversions: metrics.conversions ?? null,
          isEstimated: metrics.isEstimated,
        })
        .returning();
      snapshots.push(snapshot);
    }

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "metrics.refresh",
      targetType: "content_item",
      targetId: contentItem.id,
      metadata: { channels: [...latestByChannel.keys()], snapshotCount: snapshots.length },
    });

    return NextResponse.json({ metricSnapshots: snapshots });
  } catch (err) {
    return errorResponse(err);
  }
}
