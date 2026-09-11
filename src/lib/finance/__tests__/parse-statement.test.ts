import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "@e965/xlsx";
import { parseFinancialWorkbook, StatementParseError } from "@/lib/finance/parse-statement";

// Synthetic fixture (fake company/tax id/numbers) mirroring the real
// statutory template's layout — see fixtures/sample-filing.xlsx and
// scripts/gen_fixture.py-equivalent generation notes below. Deliberately
// off-balance so it exercises the cross-statement validation warnings too:
// BS 资产总计(30)=100000 vs 负债和所有者权益总计(53)=70000, and BS 货币资金(1)=100000
// vs CF 期末现金余额(22)=90000.
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-filing.xlsx");

describe("parseFinancialWorkbook", () => {
  const buffer = readFileSync(FIXTURE_PATH);
  const result = parseFinancialWorkbook(buffer);

  it("extracts the filing period, tax id, and entity name from the sheet headers", () => {
    expect(result.periodEnd.getFullYear()).toBe(2025);
    expect(result.periodEnd.getMonth()).toBe(0); // January
    expect(result.periodEnd.getDate()).toBe(31);
    expect(result.taxId).toBe("91000000TESTFIXTURE01");
    expect(result.entityLegalNameZh).toBe("测试贸易有限公司（fixture）");
  });

  it("parses all 3 statements", () => {
    expect(result.statements.map((s) => s.statementType).sort()).toEqual(
      ["BALANCE_SHEET", "CASH_FLOW", "INCOME_STATEMENT"].sort()
    );
  });

  it("splits the balance sheet's dual-column layout into ASSET and LIABILITY_EQUITY sides", () => {
    const bs = result.statements.find((s) => s.statementType === "BALANCE_SHEET")!;
    const cash = bs.lineItems.find((i) => i.lineNo === 1)!;
    expect(cash.side).toBe("ASSET");
    expect(cash.code).toBe("cash_and_equivalents");
    expect(cash.labelKo).toBe("현금 및 현금성자산");
    expect(cash.value).toBe(100000);
    expect(cash.compareValue).toBe(50000);

    const borrowings = bs.lineItems.find((i) => i.lineNo === 31)!;
    expect(borrowings.side).toBe("LIABILITY_EQUITY");
    expect(borrowings.code).toBe("short_term_borrowings");
  });

  it("maps income statement and cash flow line numbers via the dictionary", () => {
    const pl = result.statements.find((s) => s.statementType === "INCOME_STATEMENT")!;
    const revenue = pl.lineItems.find((i) => i.lineNo === 1)!;
    expect(revenue.code).toBe("revenue");
    expect(revenue.value).toBe(200000);

    const cf = result.statements.find((s) => s.statementType === "CASH_FLOW")!;
    const endingCash = cf.lineItems.find((i) => i.lineNo === 22)!;
    expect(endingCash.code).toBe("ending_cash_balance");
    expect(endingCash.value).toBe(90000);
  });

  it("flags the deliberate balance-sheet and cash cross-statement mismatches", () => {
    expect(result.warnings.length).toBe(2);
    expect(result.warnings.some((w) => w.includes("자산총계"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("화폐자금"))).toBe(true);
  });

  it("rejects a workbook missing a required sheet", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["empty"]]), "资产负债表");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(() => parseFinancialWorkbook(buf)).toThrow(StatementParseError);
  });
});
