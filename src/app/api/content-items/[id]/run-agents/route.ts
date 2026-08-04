import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, contentItems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { runOrchestration, OrchestrationError } from "@/lib/agents/orchestrator";
import { InvalidTransitionError } from "@/lib/state-machine";

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof OrchestrationError || err instanceof InvalidTransitionError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
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

// POST /api/content-items/[id]/run-agents — runs the mock multi-agent
// pipeline (RESEARCH → STRATEGY → COPYWRITING/CREATIVE × 3 channels →
// QUALITY_REVIEW) for this content item and advances its status accordingly.
// Requires EDITOR+.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "에이전트를 실행할 권한이 없습니다 (Editor 이상 필요).");
    const { id } = await params;

    const owned = await loadOwnedContentItem(id, org.organizationId);
    if (!owned) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await runOrchestration(id);

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
