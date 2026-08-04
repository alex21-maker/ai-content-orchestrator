import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, contentItems } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const createContentItemSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(300),
  coreIdea: z.string().trim().max(4000).optional(),
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

/** Loads the campaign and enforces tenant isolation: 404 if it belongs to another org. */
async function loadOwnedCampaign(campaignId: string, organizationId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  return campaign ?? null;
}

// GET /api/campaigns/[id]/content-items — list content items belonging to this campaign.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    const { id } = await params;

    const campaign = await loadOwnedCampaign(id, org.organizationId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.campaignId, campaign.id))
      .orderBy(desc(contentItems.createdAt));

    return NextResponse.json({ contentItems: items });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/campaigns/[id]/content-items — create a new content item (status defaults to IDEA). Requires EDITOR+.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "콘텐츠 아이디어를 생성할 권한이 없습니다.");
    const { id } = await params;

    const campaign = await loadOwnedCampaign(id, org.organizationId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = createContentItemSchema.parse(await request.json());

    const [created] = await db
      .insert(contentItems)
      .values({
        campaignId: campaign.id,
        title: body.title,
        coreIdea: body.coreIdea ?? null,
      })
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "content_item.create",
      targetType: "content_item",
      targetId: created.id,
      metadata: { campaignId: campaign.id, title: created.title },
    });

    return NextResponse.json({ contentItem: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
