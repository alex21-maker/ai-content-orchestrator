import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/current-org";
import { canEdit } from "@/lib/rbac";
import { loadOwnedEntity, listFilingsForEntity, getFilingKpis, type FinanceKpis } from "@/lib/finance/queries";
import { formatAmount, formatPercent, formatPeriod } from "@/lib/finance/format";
import { FinanceFilingUploadForm } from "@/components/finance-filing-upload-form";
import { FinanceSparkline } from "@/components/finance-sparkline";

function Delta({ current, previous, currency }: { current: number | null | undefined; previous: number | null | undefined; currency: string }) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return <span className="text-[11px] text-[var(--sub)]">전월 대비 변동 없음</span>;
  const positive = diff > 0;
  return (
    <span className={`text-[11px] font-medium ${positive ? "text-emerald-700" : "text-red-600"}`}>
      {positive ? "▲" : "▼"} {formatAmount(Math.abs(diff), currency)}
    </span>
  );
}

function KpiCard({ label, value, delta, warn }: { label: string; value: string; delta?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <p className="text-[11px] text-[var(--sub)]">{label}</p>
      <p className={`mt-1 text-lg font-bold ${warn ? "text-red-600" : ""}`}>{value}</p>
      {delta}
    </div>
  );
}

export default async function FinanceEntityDetailPage({ params }: { params: Promise<{ entityId: string }> }) {
  const org = await requireCurrentOrg();
  const { entityId } = await params;

  const entity = await loadOwnedEntity(entityId, org.organizationId);
  if (!entity) notFound();

  const filingsDesc = await listFilingsForEntity(entityId);
  const filingsAsc = [...filingsDesc].reverse();
  const kpisByFilingId = new Map<string, FinanceKpis>();
  for (const filing of filingsAsc) {
    kpisByFilingId.set(filing.id, await getFilingKpis(filing.id));
  }

  const latest = filingsDesc[0];
  const previous = filingsDesc[1];
  const latestKpis = latest ? kpisByFilingId.get(latest.id) : undefined;
  const previousKpis = previous ? kpisByFilingId.get(previous.id) : undefined;
  const currency = entity.currency;

  const debtRatio =
    latestKpis?.total_liabilities?.value != null && latestKpis?.total_equity?.value
      ? (latestKpis.total_liabilities.value / latestKpis.total_equity.value) * 100
      : null;

  const revenueSeries = filingsAsc.map((f) => ({ label: formatPeriod(f.periodEnd), value: kpisByFilingId.get(f.id)?.revenue?.compareValue ?? null }));
  const cashSeries = filingsAsc.map((f) => ({ label: formatPeriod(f.periodEnd), value: kpisByFilingId.get(f.id)?.cash_and_equivalents?.value ?? null }));
  const opCfSeries = filingsAsc.map((f) => ({
    label: formatPeriod(f.periodEnd),
    value: kpisByFilingId.get(f.id)?.net_cash_from_operating?.compareValue ?? null,
  }));

  return (
    <div>
      <Link href="/dashboard/finance" className="text-xs text-[var(--sub)] hover:text-[var(--accent)]">
        ← 법인 목록
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{entity.name}</h1>
          <p className="mt-0.5 text-xs text-[var(--sub)]">
            {entity.legalNameZh ?? "법인명 미확인"}
            {entity.taxId ? ` · ${entity.taxId}` : ""} · {entity.currency}
          </p>
        </div>
      </div>

      {latest && latestKpis ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label={`매출 (${formatPeriod(latest.periodEnd)} 당월)`}
              value={formatAmount(latestKpis.revenue?.compareValue, currency)}
              delta={<Delta current={latestKpis.revenue?.compareValue} previous={previousKpis?.revenue?.compareValue} currency={currency} />}
            />
            <KpiCard
              label="순이익 (당월)"
              value={formatAmount(latestKpis.net_profit?.compareValue, currency)}
              warn={(latestKpis.net_profit?.compareValue ?? 0) < 0}
              delta={<Delta current={latestKpis.net_profit?.compareValue} previous={previousKpis?.net_profit?.compareValue} currency={currency} />}
            />
            <KpiCard
              label="현금잔액 (기말)"
              value={formatAmount(latestKpis.cash_and_equivalents?.value, currency)}
              delta={<Delta current={latestKpis.cash_and_equivalents?.value} previous={previousKpis?.cash_and_equivalents?.value} currency={currency} />}
            />
            <KpiCard
              label="영업활동 현금흐름 (당월)"
              value={formatAmount(latestKpis.net_cash_from_operating?.compareValue, currency)}
              warn={(latestKpis.net_cash_from_operating?.compareValue ?? 0) < 0}
              delta={
                <Delta
                  current={latestKpis.net_cash_from_operating?.compareValue}
                  previous={previousKpis?.net_cash_from_operating?.compareValue}
                  currency={currency}
                />
              }
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--sub)]">
            부채비율(부채총계/자본총계) {formatPercent(debtRatio)} · 자산총계 {formatAmount(latestKpis.total_assets?.value, currency)}
          </p>

          {filingsAsc.length >= 2 && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                <h3 className="text-[11px] font-bold text-[var(--sub)]">매출 추이 (당월)</h3>
                <div className="mt-2">
                  <FinanceSparkline points={revenueSeries} formatValue={(v) => formatAmount(v, currency)} />
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                <h3 className="text-[11px] font-bold text-[var(--sub)]">현금잔액 추이 (기말)</h3>
                <div className="mt-2">
                  <FinanceSparkline points={cashSeries} formatValue={(v) => formatAmount(v, currency)} />
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                <h3 className="text-[11px] font-bold text-[var(--sub)]">영업활동 현금흐름 추이 (당월)</h3>
                <div className="mt-2">
                  <FinanceSparkline points={opCfSeries} formatValue={(v) => formatAmount(v, currency)} />
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="mt-6 text-sm text-[var(--sub)]">아직 업로드된 재무제표가 없습니다. 아래에서 첫 재무제표를 업로드하세요.</p>
      )}

      {canEdit(org.role) && (
        <div className="mt-6">
          <FinanceFilingUploadForm entityId={entity.id} />
        </div>
      )}

      {filingsDesc.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold">업로드된 재무제표</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {filingsDesc.map((filing) => (
              <li key={filing.id}>
                <Link
                  href={`/dashboard/finance/${entity.id}/filings/${filing.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm hover:border-[var(--accent)]"
                >
                  <span>{formatPeriod(filing.periodEnd)} 기준</span>
                  <span className="flex items-center gap-2 text-xs text-[var(--sub)]">
                    {filing.sourceFileName}
                    {filing.warnings.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        경고 {filing.warnings.length}건
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
