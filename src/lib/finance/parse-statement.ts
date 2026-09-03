// Parses one uploaded xls/xlsx workbook containing China's 小企业会计准则
// (Small Business Accounting Standards) 3-statement monthly tax filing —
// 资产负债表 (balance sheet), 利润表 (income statement), 现金流量表 (cash flow)
// — into the standardized shape in ./types.ts. See ./line-item-dictionary.ts
// for the 行次 -> code/labelKo mapping this relies on.
//
// Phase 1 scope: only this one statutory template is supported (matches the
// sample filing this feature was built against). A workbook missing any of
// the 3 sheets, or whose sheets don't match this layout, is rejected with a
// clear error rather than silently producing partial/wrong data.

import * as XLSX from "@e965/xlsx";
import { lookupLineItem } from "./line-item-dictionary";
import type { FinanceStatementType, ParsedFinancialWorkbook, ParsedLineItem, ParsedStatement } from "./types";

export class StatementParseError extends Error {}

const SHEET_NAME_PATTERNS: Record<FinanceStatementType, RegExp> = {
  BALANCE_SHEET: /资产负债表/,
  INCOME_STATEMENT: /利润表/,
  CASH_FLOW: /现金流量表/,
};

type Row = unknown[];

function cellText(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function cellNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function findSheetName(sheetNames: string[], type: FinanceStatementType): string | null {
  return sheetNames.find((name) => SHEET_NAME_PATTERNS[type].test(name)) ?? null;
}

/** Finds the header row (e.g. ["资产","行次","期末余额","年初余额",...]) so parsing tolerates a few extra leading rows. */
function findHeaderRowIndex(rows: Row[]): number {
  const idx = rows.findIndex((row) => cellText(row[1]) === "行次");
  if (idx === -1) throw new StatementParseError("표 헤더(行次 열)를 찾을 수 없습니다.");
  return idx;
}

function parseBlock(
  rows: Row[],
  headerRowIndex: number,
  cols: { label: number; lineNo: number; value: number; compareValue: number },
  statementType: FinanceStatementType,
  side: "ASSET" | "LIABILITY_EQUITY" | null
): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const labelZh = cellText(row[cols.label]);
    const lineNo = cellNumber(row[cols.lineNo]);
    // Section headers (e.g. "流动资产：") and trailing signature rows have no
    // 行次 — skip them, they carry no data of their own.
    if (!labelZh || lineNo === null) continue;

    const dictEntry = lookupLineItem(statementType, lineNo);
    items.push({
      lineNo,
      labelZh,
      code: dictEntry?.code ?? null,
      labelKo: dictEntry?.labelKo ?? null,
      side: side ?? dictEntry?.side ?? null,
      value: cellNumber(row[cols.value]),
      compareValue: cellNumber(row[cols.compareValue]),
    });
  }
  return items;
}

function parseStatementSheet(rows: Row[], statementType: FinanceStatementType): ParsedLineItem[] {
  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = rows[headerRowIndex];
  const isDualColumn = statementType === "BALANCE_SHEET" && cellText(headerRow[5]) === "行次";

  const left = parseBlock(rows, headerRowIndex, { label: 0, lineNo: 1, value: 2, compareValue: 3 }, statementType, isDualColumn ? "ASSET" : null);
  if (!isDualColumn) return left;

  const right = parseBlock(rows, headerRowIndex, { label: 4, lineNo: 5, value: 6, compareValue: 7 }, statementType, "LIABILITY_EQUITY");
  return [...left, ...right];
}

/** Scans the sheet's first few rows for "纳税人识别号：..." / "核算单位：...". */
function extractHeaderFields(rows: Row[]): { taxId: string | null; entityLegalNameZh: string | null } {
  let taxId: string | null = null;
  let entityLegalNameZh: string | null = null;
  for (const row of rows.slice(0, 4)) {
    for (const cell of row) {
      const text = cellText(cell);
      const taxMatch = text.match(/纳税人识别号[:：]\s*(\S+)/);
      if (taxMatch) taxId = taxMatch[1];
      const nameMatch = text.match(/核算单位[:：]\s*(\S+)/);
      if (nameMatch) entityLegalNameZh = nameMatch[1];
    }
  }
  return { taxId, entityLegalNameZh };
}

/** Scans the sheet's first few rows for a period-end date (full date beats a bare year-month). */
function extractPeriodEnd(rows: Row[]): Date | null {
  let best: Date | null = null;
  let bestHasDay = false;
  for (const row of rows.slice(0, 4)) {
    for (const cell of row) {
      if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
        return cell;
      }
      const text = cellText(cell);
      const full = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
      const yearMonth = text.match(/^(\d{4})-(\d{2})$/);
      if (yearMonth && !bestHasDay) {
        const year = Number(yearMonth[1]);
        const month = Number(yearMonth[2]);
        best = new Date(year, month, 0); // last day of that month
        bestHasDay = false;
      }
    }
  }
  return best;
}

const EPSILON = 0.01;

function nearlyEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return true; // nothing to cross-check
  return Math.abs(a - b) < EPSILON;
}

function findItem(statement: ParsedStatement | undefined, lineNo: number): ParsedLineItem | undefined {
  return statement?.lineItems.find((item) => item.lineNo === lineNo);
}

/** Cross-checks the parsed statements against each other; returns human-readable warnings (never throws — a mismatch is surfaced, not blocked). */
function validate(statements: ParsedStatement[]): string[] {
  const warnings: string[] = [];
  const bs = statements.find((s) => s.statementType === "BALANCE_SHEET");
  const cf = statements.find((s) => s.statementType === "CASH_FLOW");

  const totalAssets = findItem(bs, 30);
  const totalLiabEquity = findItem(bs, 53);
  if (totalAssets && totalLiabEquity) {
    if (!nearlyEqual(totalAssets.value, totalLiabEquity.value)) {
      warnings.push(
        `대차대조표 불일치: 자산총계(${totalAssets.value ?? "-"})와 부채와자본총계(${totalLiabEquity.value ?? "-"})가 기말 기준 일치하지 않습니다.`
      );
    }
    if (!nearlyEqual(totalAssets.compareValue, totalLiabEquity.compareValue)) {
      warnings.push(
        `대차대조표 불일치: 자산총계(${totalAssets.compareValue ?? "-"})와 부채와자본총계(${totalLiabEquity.compareValue ?? "-"})가 기초 기준 일치하지 않습니다.`
      );
    }
  }

  const bsCash = findItem(bs, 1);
  const cfEndingCash = findItem(cf, 22);
  if (bsCash && cfEndingCash && !nearlyEqual(bsCash.value, cfEndingCash.value)) {
    warnings.push(
      `현금 불일치: 재무상태표 화폐자금(${bsCash.value ?? "-"})과 현금흐름표 기말현금잔액(${cfEndingCash.value ?? "-"})이 일치하지 않습니다.`
    );
  }

  const cfBeginningCash = findItem(cf, 21);
  if (bsCash && cfBeginningCash && !nearlyEqual(bsCash.compareValue, cfBeginningCash.value)) {
    warnings.push(
      `현금 불일치: 재무상태표 화폐자금 기초잔액(${bsCash.compareValue ?? "-"})과 현금흐름표 기초현금잔액(${cfBeginningCash.value ?? "-"})이 일치하지 않습니다.`
    );
  }

  return warnings;
}

export function parseFinancialWorkbook(buffer: Buffer | ArrayBuffer): ParsedFinancialWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: false, bookVBA: false });

  const statements: ParsedStatement[] = [];
  let taxId: string | null = null;
  let entityLegalNameZh: string | null = null;
  let periodEnd: Date | null = null;

  for (const statementType of Object.keys(SHEET_NAME_PATTERNS) as FinanceStatementType[]) {
    const sheetName = findSheetName(workbook.SheetNames, statementType);
    if (!sheetName) {
      throw new StatementParseError(
        `필요한 표를 찾을 수 없습니다: ${statementType === "BALANCE_SHEET" ? "资产负债表" : statementType === "INCOME_STATEMENT" ? "利润表" : "现金流量表"}. 3개 표(재무상태표/손익계산서/현금흐름표)가 모두 포함된 워크북을 업로드하세요.`
      );
    }
    const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });

    const headerFields = extractHeaderFields(rows);
    taxId ??= headerFields.taxId;
    entityLegalNameZh ??= headerFields.entityLegalNameZh;
    const sheetPeriodEnd = extractPeriodEnd(rows);
    if (sheetPeriodEnd && (!periodEnd || sheetPeriodEnd > periodEnd)) periodEnd = sheetPeriodEnd;

    statements.push({ statementType, lineItems: parseStatementSheet(rows, statementType) });
  }

  if (!periodEnd) {
    throw new StatementParseError("기준일(期末/期间)을 찾을 수 없습니다.");
  }

  return { periodEnd, entityLegalNameZh, taxId, statements, warnings: validate(statements) };
}
