// 行次 (line number) -> standardized code + Korean label, for each of the
// 3 statutory statements in China's 小企业会计准则 (Small Business Accounting
// Standards) monthly tax filing template — see src/lib/finance/parse-statement.ts.
//
// 行次 is the stable key: it's a nationally standardized form field, so it
// stays fixed across periods even though the Chinese label text (indentation,
// "其中/减/加" prefixes) can vary in how a given export renders it. This
// dictionary only covers that one standard template (Phase 1 scope) — a
// lineNo not found here still gets stored (see parse-statement.ts), just
// without a `code`/`labelKo`.
//
// On the balance sheet only, 行次 1-30 are the asset side and 31-53 are the
// liabilities+equity side of the form's two-column layout — `side`
// disambiguates rows for display grouping (both ranges are globally unique,
// so it isn't needed for lookup itself).

import type { FinanceStatementType } from "./types";

export interface LineItemDictionaryEntry {
  code: string;
  labelKo: string;
  side?: "ASSET" | "LIABILITY_EQUITY";
}

const BALANCE_SHEET: Record<number, LineItemDictionaryEntry> = {
  1: { code: "cash_and_equivalents", labelKo: "현금 및 현금성자산", side: "ASSET" },
  2: { code: "short_term_investments", labelKo: "단기투자자산", side: "ASSET" },
  3: { code: "notes_receivable", labelKo: "받을어음", side: "ASSET" },
  4: { code: "accounts_receivable", labelKo: "매출채권", side: "ASSET" },
  5: { code: "prepayments", labelKo: "선급금", side: "ASSET" },
  6: { code: "dividends_receivable", labelKo: "미수배당금", side: "ASSET" },
  7: { code: "interest_receivable", labelKo: "미수이자", side: "ASSET" },
  8: { code: "other_receivables", labelKo: "기타미수금", side: "ASSET" },
  9: { code: "inventory", labelKo: "재고자산", side: "ASSET" },
  10: { code: "inventory_raw_materials", labelKo: "(원재료)", side: "ASSET" },
  11: { code: "inventory_work_in_progress", labelKo: "(재공품)", side: "ASSET" },
  12: { code: "inventory_finished_goods", labelKo: "(상품재고)", side: "ASSET" },
  13: { code: "inventory_turnover_materials", labelKo: "(소모성자재)", side: "ASSET" },
  14: { code: "other_current_assets", labelKo: "기타유동자산", side: "ASSET" },
  15: { code: "total_current_assets", labelKo: "유동자산 합계", side: "ASSET" },
  16: { code: "long_term_bond_investments", labelKo: "장기채권투자", side: "ASSET" },
  17: { code: "long_term_equity_investments", labelKo: "장기지분투자", side: "ASSET" },
  18: { code: "fixed_assets_original_cost", labelKo: "유형자산 원가", side: "ASSET" },
  19: { code: "accumulated_depreciation", labelKo: "감가상각누계액", side: "ASSET" },
  20: { code: "fixed_assets_net_value", labelKo: "유형자산 장부가액", side: "ASSET" },
  21: { code: "construction_in_progress", labelKo: "건설중인자산", side: "ASSET" },
  22: { code: "project_materials", labelKo: "건설자재", side: "ASSET" },
  23: { code: "fixed_assets_disposal", labelKo: "유형자산 처분", side: "ASSET" },
  24: { code: "biological_assets", labelKo: "생물자산", side: "ASSET" },
  25: { code: "intangible_assets", labelKo: "무형자산", side: "ASSET" },
  26: { code: "development_expenditure", labelKo: "개발비", side: "ASSET" },
  27: { code: "long_term_deferred_expenses", labelKo: "장기선급비용", side: "ASSET" },
  28: { code: "other_noncurrent_assets", labelKo: "기타비유동자산", side: "ASSET" },
  29: { code: "total_noncurrent_assets", labelKo: "비유동자산 합계", side: "ASSET" },
  30: { code: "total_assets", labelKo: "자산총계", side: "ASSET" },
  31: { code: "short_term_borrowings", labelKo: "단기차입금", side: "LIABILITY_EQUITY" },
  32: { code: "notes_payable", labelKo: "지급어음", side: "LIABILITY_EQUITY" },
  33: { code: "accounts_payable", labelKo: "매입채무", side: "LIABILITY_EQUITY" },
  34: { code: "advances_from_customers", labelKo: "선수금", side: "LIABILITY_EQUITY" },
  35: { code: "employee_benefits_payable", labelKo: "미지급급여", side: "LIABILITY_EQUITY" },
  36: { code: "taxes_payable", labelKo: "미지급세금", side: "LIABILITY_EQUITY" },
  37: { code: "interest_payable", labelKo: "미지급이자", side: "LIABILITY_EQUITY" },
  38: { code: "dividends_payable", labelKo: "미지급이익", side: "LIABILITY_EQUITY" },
  39: { code: "other_payables", labelKo: "기타미지급금", side: "LIABILITY_EQUITY" },
  40: { code: "other_current_liabilities", labelKo: "기타유동부채", side: "LIABILITY_EQUITY" },
  41: { code: "total_current_liabilities", labelKo: "유동부채 합계", side: "LIABILITY_EQUITY" },
  42: { code: "long_term_borrowings", labelKo: "장기차입금", side: "LIABILITY_EQUITY" },
  43: { code: "long_term_payables", labelKo: "장기미지급금", side: "LIABILITY_EQUITY" },
  44: { code: "deferred_income", labelKo: "이연수익", side: "LIABILITY_EQUITY" },
  45: { code: "other_noncurrent_liabilities", labelKo: "기타비유동부채", side: "LIABILITY_EQUITY" },
  46: { code: "total_noncurrent_liabilities", labelKo: "비유동부채 합계", side: "LIABILITY_EQUITY" },
  47: { code: "total_liabilities", labelKo: "부채총계", side: "LIABILITY_EQUITY" },
  48: { code: "paid_in_capital", labelKo: "납입자본(자본금)", side: "LIABILITY_EQUITY" },
  49: { code: "capital_reserve", labelKo: "자본잉여금", side: "LIABILITY_EQUITY" },
  50: { code: "surplus_reserve", labelKo: "이익잉여금(적립)", side: "LIABILITY_EQUITY" },
  51: { code: "retained_earnings", labelKo: "미처분이익잉여금", side: "LIABILITY_EQUITY" },
  52: { code: "total_equity", labelKo: "자본총계", side: "LIABILITY_EQUITY" },
  53: { code: "total_liabilities_and_equity", labelKo: "부채와자본총계", side: "LIABILITY_EQUITY" },
};

const INCOME_STATEMENT: Record<number, LineItemDictionaryEntry> = {
  1: { code: "revenue", labelKo: "영업수익(매출액)" },
  2: { code: "cost_of_revenue", labelKo: "매출원가" },
  3: { code: "taxes_and_surcharges", labelKo: "세금과공과" },
  4: { code: "consumption_tax", labelKo: "(소비세)" },
  5: { code: "business_tax", labelKo: "(영업세)" },
  6: { code: "urban_maintenance_tax", labelKo: "(도시유지건설세)" },
  7: { code: "resource_tax", labelKo: "(자원세)" },
  8: { code: "land_appreciation_tax", labelKo: "(토지증치세)" },
  9: { code: "property_and_stamp_taxes", labelKo: "(도시토지사용세 등)" },
  10: { code: "education_surcharge_etc", labelKo: "(교육비부가 등)" },
  11: { code: "selling_expenses", labelKo: "판매비" },
  12: { code: "repair_expense", labelKo: "(상품수리비)" },
  13: { code: "advertising_expenses", labelKo: "(광고선전비)" },
  14: { code: "administrative_expenses", labelKo: "관리비" },
  15: { code: "startup_expenses", labelKo: "(개업비)" },
  16: { code: "entertainment_expenses", labelKo: "(접대비)" },
  17: { code: "r_and_d_expenses", labelKo: "연구개발비" },
  18: { code: "finance_expenses", labelKo: "재무비용" },
  19: { code: "interest_expense", labelKo: "(이자비용)" },
  20: { code: "investment_income", labelKo: "투자수익" },
  21: { code: "operating_profit", labelKo: "영업이익" },
  22: { code: "non_operating_income", labelKo: "영업외수익" },
  23: { code: "government_subsidy", labelKo: "(정부보조금)" },
  24: { code: "non_operating_expenses", labelKo: "영업외비용" },
  25: { code: "bad_debt_loss", labelKo: "(대손상각비)" },
  26: { code: "uncollectible_bond_loss", labelKo: "(장기채권 회수불능손실)" },
  27: { code: "uncollectible_equity_loss", labelKo: "(장기지분 회수불능손실)" },
  28: { code: "force_majeure_loss", labelKo: "(불가항력 손실)" },
  29: { code: "tax_late_fee", labelKo: "(세금연체료)" },
  30: { code: "total_profit", labelKo: "세전이익" },
  31: { code: "income_tax_expense", labelKo: "법인세비용" },
  32: { code: "net_profit", labelKo: "당기순이익" },
};

const CASH_FLOW: Record<number, LineItemDictionaryEntry> = {
  1: { code: "cash_from_sales", labelKo: "매출 관련 현금유입" },
  2: { code: "other_operating_cash_in", labelKo: "기타 영업활동 현금유입" },
  3: { code: "cash_paid_for_goods_services", labelKo: "매입 관련 현금유출" },
  4: { code: "cash_paid_to_employees", labelKo: "급여 지급" },
  5: { code: "taxes_paid", labelKo: "세금 납부" },
  6: { code: "other_operating_cash_out", labelKo: "기타 영업활동 현금유출" },
  7: { code: "net_cash_from_operating", labelKo: "영업활동 현금흐름 순액" },
  8: { code: "proceeds_from_investment_disposal", labelKo: "투자회수 현금유입" },
  9: { code: "investment_income_received", labelKo: "투자수익 현금유입" },
  10: { code: "proceeds_from_asset_disposal", labelKo: "자산처분 현금유입" },
  11: { code: "cash_paid_for_investments", labelKo: "투자 현금유출" },
  12: { code: "cash_paid_for_capex", labelKo: "자본적 지출" },
  13: { code: "net_cash_from_investing", labelKo: "투자활동 현금흐름 순액" },
  14: { code: "proceeds_from_borrowings", labelKo: "차입금 조달 현금유입" },
  15: { code: "proceeds_from_equity_issuance", labelKo: "유상증자 현금유입" },
  16: { code: "repayment_of_borrowings", labelKo: "차입금 상환" },
  17: { code: "interest_paid", labelKo: "이자 지급" },
  18: { code: "dividends_paid", labelKo: "배당금 지급" },
  19: { code: "net_cash_from_financing", labelKo: "재무활동 현금흐름 순액" },
  20: { code: "net_increase_in_cash", labelKo: "현금 순증가액" },
  21: { code: "beginning_cash_balance", labelKo: "기초 현금잔액" },
  22: { code: "ending_cash_balance", labelKo: "기말 현금잔액" },
};

const DICTIONARIES: Record<FinanceStatementType, Record<number, LineItemDictionaryEntry>> = {
  BALANCE_SHEET,
  INCOME_STATEMENT,
  CASH_FLOW,
};

export function lookupLineItem(statementType: FinanceStatementType, lineNo: number): LineItemDictionaryEntry | null {
  return DICTIONARIES[statementType]?.[lineNo] ?? null;
}
