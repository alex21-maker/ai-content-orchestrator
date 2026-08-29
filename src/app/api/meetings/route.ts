import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const createMeetingSchema = z.object({
  title: z.string().trim().min(1, "회의 제목을 입력하세요.").max(200),
  occurredAt: z.string().trim().datetime().optional(),
  languages: z.array(z.string().trim().min(1).max(10)).min(1).max(5).optional(),
  participants: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
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

// GET /api/meetings — list this org's meetings, most recent first.
export async function GET() {
  try {
    const org = await requireCurrentOrg();

    const rows = await db
      .select()
      .from(meetings)
      .where(eq(meetings.organizationId, org.organizationId))
      .orderBy(desc(meetings.occurredAt));

    return NextResponse.json({ meetings: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/meetings — create a meeting record for the caller's org. Requires EDITOR+.
export async function POST(request: NextRequest) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "회의를 등록할 권한이 없습니다.");

    const body = createMeetingSchema.parse(await request.json());

    const [created] = await db
      .insert(meetings)
      .values({
        organizationId: org.organizationId,
        title: body.title,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        languages: body.languages ?? ["ko", "zh"],
        participants: body.participants ?? [],
        createdById: org.userId,
      })
      .returning();

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "meeting.create",
      targetType: "meeting",
      targetId: created.id,
      metadata: { title: created.title },
    });

    return NextResponse.json({ meeting: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
