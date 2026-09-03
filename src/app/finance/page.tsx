import Link from "next/link";
import { listAllEntitiesPublic, listFilingsForEntity, getFilingKpis } from "@/lib/finance/queries";
import { formatAmount, formatPeriod } from "@/lib/finance/format";

export default async function PublicFinanceEntitiesPage() {
  const entities = await listAllEntitiesPublic();

  const cards = await Promise.all(
    entities.map(async (entity) => {
      const filings = await listFilingsForEntity(entity.id);
      const latest = filings[0];
      const kpis = latest ? await getFilingKpis(latest.id) : null;
      return { entity, latest, kpis, filingCount: filings.length };
    })
  );

  return (
    <div>
      <h1 className="text-xl font-bold">법인별 재무 현황</h1>
      <p className="mt-1 text-sm text-[var(--sub)]">
        업로드된 월간 재무제표(资产负债表·利润表·现金流量表)를 기준으로 매출·순이익·현금흐름을 확인합니다.
      </p>

      {cards.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--sub)]">아직 등록된 법인이 없습니다.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map(({ entity, latest, kpis, filingCount }) => (
            <li key={entity.id}>
              <Link
                href={`/finance/${entity.id}`}
                className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-4 hover:border-[var(--accent)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{entity.name}</p>
                    {entity.legalNameZh && <p className="mt-0.5 truncate text-[11px] text-[var(--sub)]">{entity.legalNameZh}</p>}
                  </div>
                  {latest && latest.warnings.length > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      경고 {latest.warnings.length}건
                    </span>
                  )}
                </div>
                {latest && kpis ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="col-span-2">
                      <p className="text-[var(--sub)]">최근 기준월 ({formatPeriod(latest.periodEnd)})</p>
                    </div>
                    <div>
                      <p className="text-[var(--sub)]">매출(당월)</p>
                      <p className="font-semibold">{formatAmount(kpis.revenue?.compareValue, entity.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--sub)]">순이익(당월)</p>
                      <p className={`font-semibold ${(kpis.net_profit?.compareValue ?? 0) < 0 ? "text-red-600" : ""}`}>
                        {formatAmount(kpis.net_profit?.compareValue, entity.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--sub)]">현금잔액(기말)</p>
                      <p className="font-semibold">{formatAmount(kpis.cash_and_equivalents?.value, entity.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--sub)]">영업CF(당월)</p>
                      <p className={`font-semibold ${(kpis.net_cash_from_operating?.compareValue ?? 0) < 0 ? "text-red-600" : ""}`}>
                        {formatAmount(kpis.net_cash_from_operating?.compareValue, entity.currency)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--sub)]">아직 업로드된 재무제표가 없습니다.</p>
                )}
                <p className="text-[10px] text-[var(--sub)]">filing {filingCount}건</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
