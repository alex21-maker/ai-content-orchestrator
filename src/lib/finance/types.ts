export type FinanceStatementType = "BALANCE_SHEET" | "INCOME_STATEMENT" | "CASH_FLOW";

export interface ParsedLineItem {
  lineNo: number;
  labelZh: string;
  code: string | null;
  labelKo: string | null;
  side: "ASSET" | "LIABILITY_EQUITY" | null;
  /** BS: 期末余额 (period-end) · PL/CF: 本年累计金额 (year-to-date) */
  value: number | null;
  /** BS: 年初余额 (year-start) · PL/CF: 本月金额 (this month) */
  compareValue: number | null;
}

export interface ParsedStatement {
  statementType: FinanceStatementType;
  lineItems: ParsedLineItem[];
}

export interface ParsedFinancialWorkbook {
  periodEnd: Date;
  entityLegalNameZh: string | null;
  taxId: string | null;
  statements: ParsedStatement[];
  warnings: string[];
}
