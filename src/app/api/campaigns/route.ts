import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "캠페인 이름을 입력하세요.").max(200),
  brief: z.string().trim().min(1, "브리프를 입력하세요."),
  goal: z.string().trim().max(2000).optional(),
  targetPersona: z.string().trim().max(2000).optional(),
  funnelStage: z.string().trim().max(200).optional(),
  brandProfileId: z.string().trim().min(1).optional(),
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

// GET /api/campaigns — list all (non-archived-first) campaigns for the caller's org.
export async function GET() {
  try {
    const org = await requireCurrentOrg();

    const rows = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.organizationId, org.organizationId))
      .orderBy(desc(campaigns.createdAt));

    return NextResponse.json({ campaigns: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/campaigns — create a campaign in the caller's org. Requires EDITOR+.
export async function POST(request: NextRequest) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "캠페인을 생성할 권한이 없습니다.");

    const body = createCampaignSchema.parse(await request.json());

    // If a brandProfileId was supplied, confirm it belongs to this org too —
    // otherwise a caller could link a campaign to another tenant's brand.
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

    const [created] = await db
      .insert(campaigns)
      .values({
        organizationId: org.organizationId,
        brandProfileId: body.brandProfileId ?? null,
        name: body.name,
        brief: body.brief,
        goal: body.goal ?? null,
        targetPersona: body.targetPersona ?? null,
        funnelStage: body.funnelStage ?? null,
      })
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "campaign.create",
      targetType: "campaign",
      targetId: created.id,
      metadata: { name: created.name },
    });

    return NextResponse.json({ campaign: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
