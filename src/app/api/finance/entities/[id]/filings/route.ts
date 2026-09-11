import { NextRequest, NextResponse } from "next/server";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { ForbiddenError, assertRole, canEdit } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveAsset } from "@/lib/storage";
import { loadOwnedEntity, listFilingsForEntity } from "@/lib/finance/queries";
import { parseFinancialWorkbook, StatementParseError } from "@/lib/finance/parse-statement";
import { ingestFiling } from "@/lib/finance/ingest";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — a statutory filing workbook is a few hundred KB at most

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof StatementParseError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/finance/entities/[id]/filings — list an entity's filings, most recent period first.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    const { id } = await params;

    const entity = await loadOwnedEntity(id, org.organizationId);
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const filings = await listFilingsForEntity(id);
    return NextResponse.json({ filings });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/finance/entities/[id]/filings — upload one xls/xlsx workbook (multipart `file` field)
// containing all 3 statutory statements for a period; parses, cross-validates, and stores it as
// a filing. Re-uploading the same entity+period replaces the prior filing. Requires EDITOR+.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    assertRole(org.role, canEdit, "재무제표를 업로드할 권한이 없습니다.");
    const { id } = await params;

    const entity = await loadOwnedEntity(id, org.organizationId);
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "업로드할 파일(xls/xlsx)을 선택하세요." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "파일 크기는 10MB를 초과할 수 없습니다." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const parsed = parseFinancialWorkbook(Buffer.from(arrayBuffer));

    if (entity.taxId && parsed.taxId && entity.taxId !== parsed.taxId) {
      return NextResponse.json(
        {
          error: `업로드한 파일의 사업자등록번호(${parsed.taxId})가 이 법인에 등록된 번호(${entity.taxId})와 다릅니다. 다른 법인의 파일이 아닌지 확인하세요.`,
        },
        { status: 409 }
      );
    }

    const { url } = await saveAsset(file, entity.id);

    const filing = await ingestFiling({
      entityId: entity.id,
      sourceFileName: file.name,
      sourceFileUrl: url,
      uploadedById: org.userId,
      parsed,
    });

    await recordAudit({
      organizationId: org.organizationId,
      actorType: "user",
      actorId: org.userId,
      action: "finance_filing.upload",
      targetType: "financial_filing",
      targetId: filing.id,
      metadata: { entityId: entity.id, periodEnd: filing.periodEnd, warnings: filing.warnings },
    });

    return NextResponse.json({ filing }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
