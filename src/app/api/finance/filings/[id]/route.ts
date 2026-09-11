import { NextResponse } from "next/server";
import { requireCurrentOrg } from "@/lib/current-org";
import { UnauthorizedError } from "@/lib/session";
import { loadOwnedFiling, getFilingDetail, getFilingKpis } from "@/lib/finance/queries";

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/finance/filings/[id] — one filing's 3 statements (with line items) + KPI summary.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const org = await requireCurrentOrg();
    const { id } = await params;

    const owned = await loadOwnedFiling(id, org.organizationId);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [statements, kpis] = await Promise.all([getFilingDetail(id), getFilingKpis(id)]);

    return NextResponse.json({ filing: owned.filing, entity: owned.entity, statements, kpis });
  } catch (err) {
    return errorResponse(err);
  }
}
