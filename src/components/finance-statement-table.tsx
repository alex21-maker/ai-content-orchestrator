"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/finance/format";

type FinanceStatementType = "BALANCE_SHEET" | "INCOME_STATEMENT" | "CASH_FLOW";

export interface FinanceLineItemRow {
  id: string;
  lineNo: number;
  code: string | null;
  labelZh: string;
  labelKo: string | null;
  side: string | null;
  value: number | null;
  compareValue: number | null;
}

const COLUMN_LABELS: Record<FinanceStatementType, [string, string]> = {
  BALANCE_SHEET: ["기말잔액", "기초잔액"],
  INCOME_STATEMENT: ["연누계금액", "당월금액"],
  CASH_FLOW: ["연누계금액", "당월금액"],
};

function isTotalRow(code: string | null): boolean {
  return code !== null && code.startsWith("total_");
}

function Rows({ items, showKo, currency }: { items: FinanceLineItemRow[]; showKo: boolean; currency: string }) {
  return (
    <tbody>
      {items.map((item) => (
        <tr key={item.id} className={isTotalRow(item.code) ? "border-t border-[var(--line)] font-semibold" : ""}>
          <td className="py-1 pr-3 text-[11px] text-[var(--sub)]">{item.lineNo}</td>
          <td className="py-1 pr-3">{showKo ? item.labelKo ?? item.labelZh : item.labelZh}</td>
          <td className="py-1 pr-3 text-right tabular-nums">{formatAmount(item.value, currency)}</td>
          <td className="py-1 text-right tabular-nums text-[var(--sub)]">{formatAmount(item.compareValue, currency)}</td>
        </tr>
      ))}
    </tbody>
  );
}

function Table({ title, items, showKo, currency, columnLabels }: { title: string; items: FinanceLineItemRow[]; showKo: boolean; currency: string; columnLabels: [string, string] }) {
  if (items.length === 0) return null;
  return (
    <div>
      {title && <h4 className="mb-1 text-[11px] font-bold text-[var(--sub)]">{title}</h4>}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-[var(--sub)]">
            <th className="pb-1 pr-3 font-normal">行次</th>
            <th className="pb-1 pr-3 font-normal">계정과목</th>
            <th className="pb-1 pr-3 font-normal text-right">{columnLabels[0]}</th>
            <th className="pb-1 font-normal text-right">{columnLabels[1]}</th>
          </tr>
        </thead>
        <Rows items={items} showKo={showKo} currency={currency} />
      </table>
    </div>
  );
}

export function FinanceStatementTable({
  statementType,
  items,
  currency,
}: {
  statementType: FinanceStatementType;
  items: FinanceLineItemRow[];
  currency: string;
}) {
  const [showKo, setShowKo] = useState(true);
  const columnLabels = COLUMN_LABELS[statementType];

  const assetItems = items.filter((i) => i.side === "ASSET");
  const liabilityEquityItems = items.filter((i) => i.side === "LIABILITY_EQUITY");
  const isDualColumn = statementType === "BALANCE_SHEET" && (assetItems.length > 0 || liabilityEquityItems.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowKo((v) => !v)}
          className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[11px] text-[var(--sub)] hover:border-[var(--accent)]"
        >
          {showKo ? "中文 원문 보기" : "한국어로 보기"}
        </button>
      </div>
      {isDualColumn ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Table title="자산" items={assetItems} showKo={showKo} currency={currency} columnLabels={columnLabels} />
          <Table title="부채 및 자본" items={liabilityEquityItems} showKo={showKo} currency={currency} columnLabels={columnLabels} />
        </div>
      ) : (
        <Table title="" items={items} showKo={showKo} currency={currency} columnLabels={columnLabels} />
      )}
    </div>
  );
}
