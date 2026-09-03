import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { financeEntities } from "@/db/schema";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { listEntities } from "@/lib/finance/queries";

const createEntitySchema = z.object({
  name: z.string().trim().min(1, "법인 이름을 입력하세요.").max(200),
  legalNameZh: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(50).optional(),
  country: z.string().trim().max(2).optional(),
  currency: z.string().trim().max(3).optional(),
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
  if (err && typeof err === "object" && "code" in err && err.code === "23505") {
    return NextResponse.json({ error: "이미 동일한 사업자등록번호(纳税人识别号)의 법인이 등록되어 있습니다." }, { status: 409 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/finance/entities — list this org's finance entities (legal entities like "레이블 차이나").
export async function GET() {
  try {
    const org = await requireCurrentOrg();
    const rows = await listEntities(org.organizationId);
    return NextResponse.json({ entities: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/finance/entities — register a new legal entity to file financial statements under. Requires EDITOR+.
export async function POST(request: NextRequest) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "법인을 등록할 권한이 없습니다.");

    const body = createEntitySchema.parse(await request.json());

    const [created] = await db
      .insert(financeEntities)
      .values({
        organizationId: org.organizationId,
        name: body.name,
        legalNameZh: body.legalNameZh || null,
        taxId: body.taxId || null,
        country: body.country || undefined,
        currency: body.currency || undefined,
      })
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "finance_entity.create",
      targetType: "finance_entity",
      targetId: created.id,
      metadata: { name: created.name },
    });

    return NextResponse.json({ entity: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
