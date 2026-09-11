import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { loadOwnedFiling, getFilingDetail } from "@/lib/finance/queries";
import { formatPeriod } from "@/lib/finance/format";
import { FinanceStatementTable } from "@/components/finance-statement-table";

const STATEMENT_ORDER = ["BALANCE_SHEET", "INCOME_STATEMENT", "CASH_FLOW"] as const;
const STATEMENT_TITLE: Record<(typeof STATEMENT_ORDER)[number], string> = {
  BALANCE_SHEET: "재무상태표 (资产负债表)",
  INCOME_STATEMENT: "손익계산서 (利润表)",
  CASH_FLOW: "현금흐름표 (现金流量表)",
};

export default async function FinanceFilingDetailPage({ params }: { params: Promise<{ entityId: string; filingId: string }> }) {
  const org = await requireCurrentOrg();
  const { entityId, filingId } = await params;

  const owned = await loadOwnedFiling(filingId, org.organizationId);
  if (!owned || owned.entity.id !== entityId) notFound();
  const { filing, entity } = owned;

  const statements = await getFilingDetail(filingId);
  const byType = new Map(statements.map((s) => [s.statementType, s]));

  return (
    <div>
      <Link href={`/dashboard/finance/${entity.id}`} className="text-xs text-[var(--sub)] hover:text-[var(--accent)]">
        ← {entity.name}
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{entity.name} · {formatPeriod(filing.periodEnd)} 기준</h1>
          <p className="mt-0.5 text-xs text-[var(--sub)]">
            원본 파일: {filing.sourceFileName} ·{" "}
            <a href={filing.sourceFileUrl} className="text-[var(--accent)] underline">
              다운로드
            </a>
          </p>
        </div>
      </div>

      {filing.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-xs font-bold text-amber-800">⚠️ 검증 경고 {filing.warnings.length}건</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {filing.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {STATEMENT_ORDER.map((type) => {
          const statement = byType.get(type);
          if (!statement) return null;
          return (
            <div key={type} className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h2 className="text-sm font-bold">{STATEMENT_TITLE[type]}</h2>
              <div className="mt-3">
                <FinanceStatementTable statementType={type} items={statement.lineItems} currency={entity.currency} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
