// Shared read helpers for the /api/finance/* route handlers and dashboard
// pages — mirrors the pattern in src/lib/meetings.ts (scope-by-org loaders
// that return null on a tenant mismatch, so callers can turn that into 404
// rather than 403 and avoid leaking existence across orgs).

import { db } from "@/db";
import { financeEntities, financialFilings, financialLineItems, financialStatements } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function loadOwnedEntity(entityId: string, organizationId: string) {
  const [entity] = await db
    .select()
    .from(financeEntities)
    .where(and(eq(financeEntities.id, entityId), eq(financeEntities.organizationId, organizationId)))
    .limit(1);
  return entity ?? null;
}

/** Loads a filing scoped to the caller's org via its entity, or null on tenant mismatch / not found. */
export async function loadOwnedFiling(filingId: string, organizationId: string) {
  const [row] = await db
    .select({ filing: financialFilings, entity: financeEntities })
    .from(financialFilings)
    .innerJoin(financeEntities, eq(financialFilings.financeEntityId, financeEntities.id))
    .where(and(eq(financialFilings.id, filingId), eq(financeEntities.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listEntities(organizationId: string) {
  return db
    .select()
    .from(financeEntities)
    .where(eq(financeEntities.organizationId, organizationId))
    .orderBy(financeEntities.name);
}

export async function listFilingsForEntity(entityId: string) {
  return db
    .select()
    .from(financialFilings)
    .where(eq(financialFilings.financeEntityId, entityId))
    .orderBy(desc(financialFilings.periodEnd));
}

// ---------------------------------------------------------------------------
// Public, unauthenticated reads — power the view-only /finance/* pages (no
// login, no org scoping). Requested as a temporary "let people see the data
// first" step before real login is wired up there; unlike everything above,
// these intentionally skip the organizationId check, so don't reuse them
// anywhere that should stay tenant-scoped. Read-only: there is no public
// write path anywhere in this module.
// ---------------------------------------------------------------------------

export async function listAllEntitiesPublic() {
  return db.select().from(financeEntities).orderBy(financeEntities.name);
}

export async function loadEntityPublic(entityId: string) {
  const [entity] = await db.select().from(financeEntities).where(eq(financeEntities.id, entityId)).limit(1);
  return entity ?? null;
}

export async function loadFilingPublic(filingId: string) {
  const [row] = await db
    .select({ filing: financialFilings, entity: financeEntities })
    .from(financialFilings)
    .innerJoin(financeEntities, eq(financialFilings.financeEntityId, financeEntities.id))
    .where(eq(financialFilings.id, filingId))
    .limit(1);
  return row ?? null;
}

// KPI line-item codes surfaced on the dashboard — see
// src/lib/finance/line-item-dictionary.ts for the full mapping.
export const FINANCE_KPI_CODES = [
  "total_assets",
  "total_liabilities",
  "total_equity",
  "cash_and_equivalents",
  "revenue",
  "net_profit",
  "operating_profit",
  "net_cash_from_operating",
  "net_cash_from_investing",
  "net_cash_from_financing",
] as const;

export type FinanceKpiCode = (typeof FINANCE_KPI_CODES)[number];
export type FinanceKpis = Partial<Record<FinanceKpiCode, { value: number | null; compareValue: number | null }>>;

/** Pulls the dashboard KPI line items (by standard code) for one filing, across its 3 statements. */
export async function getFilingKpis(filingId: string): Promise<FinanceKpis> {
  const rows = await db
    .select({ code: financialLineItems.code, value: financialLineItems.value, compareValue: financialLineItems.compareValue })
    .from(financialLineItems)
    .innerJoin(financialStatements, eq(financialLineItems.statementId, financialStatements.id))
    .where(and(eq(financialStatements.filingId, filingId), inArray(financialLineItems.code, [...FINANCE_KPI_CODES])));

  const kpis: FinanceKpis = {};
  for (const row of rows) {
    if (row.code) kpis[row.code as FinanceKpiCode] = { value: row.value, compareValue: row.compareValue };
  }
  return kpis;
}

/** Full 3-statement detail for one filing, grouped by statement type, line items ordered by lineNo. */
export async function getFilingDetail(filingId: string) {
  const statements = await db.select().from(financialStatements).where(eq(financialStatements.filingId, filingId));

  const statementIds = statements.map((s) => s.id);
  const lineItems = statementIds.length
    ? await db
        .select()
        .from(financialLineItems)
        .where(inArray(financialLineItems.statementId, statementIds))
        .orderBy(financialLineItems.lineNo)
    : [];

  return statements.map((statement) => ({
    ...statement,
    lineItems: lineItems.filter((item) => item.statementId === statement.id),
  }));
}
