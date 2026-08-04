import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    brief: z.string().trim().min(1),
    goal: z.string().trim().max(2000).nullable(),
    targetPersona: z.string().trim().max(2000).nullable(),
    funnelStage: z.string().trim().max(200).nullable(),
    brandProfileId: z.string().trim().min(1).nullable(),
    status: z.string().trim().min(1).max(50),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "변경할 필드가 없습니다." });

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

/** Loads the campaign and enforces tenant isolation: 404 (not 403) if it belongs to another org. */
async function loadOwnedCampaign(campaignId: string, organizationId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  return campaign ?? null;
}

// GET /api/campaigns/[id] — fetch a single campaign, scoped to caller's org.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    const { id } = await params;

    const campaign = await loadOwnedCampaign(id, org.organizationId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/campaigns/[id] — update fields (including status:"archived" to archive). Requires EDITOR+.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "캠페인을 수정할 권한이 없습니다.");
    const { id } = await params;

    const existing = await loadOwnedCampaign(id, org.organizationId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = updateCampaignSchema.parse(await request.json());

    if (body.brandProfileId) {
      const { brandProfiles } = await import("@/db/schema");
      const [brand] = await db
        .select({ id: brandProfiles.id })
        .from(brandProfiles)
        .where(and(eq(brandProfiles.id, body.brandProfileId), eq(brandProfiles.organizationId, org.organizationId)))
        .limit(1);
      if (!brand) {
        return NextResponse.json({ error: "존재하지 않는 브랜드 프로필입니다." }, { status: 400 });
      }
    }

    const [updated] = await db
      .update(campaigns)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, org.organizationId)))
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "campaign.update",
      targetType: "campaign",
      targetId: updated.id,
      metadata: { changed: Object.keys(body) },
    });

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
