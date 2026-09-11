// Persists a parsed workbook (see ./parse-statement.ts) as one filing. A
// second upload for the same entity+period is treated as a correction: the
// prior filing (and its statements/line items, via ON DELETE CASCADE) is
// replaced rather than duplicated.

import { db } from "@/db";
import { financeEntities, financialFilings, financialLineItems, financialStatements } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ParsedFinancialWorkbook } from "./types";

export async function ingestFiling(params: {
  entityId: string;
  sourceFileName: string;
  sourceFileUrl: string;
  uploadedById: string;
  parsed: ParsedFinancialWorkbook;
}) {
  const { entityId, sourceFileName, sourceFileUrl, uploadedById, parsed } = params;

  return db.transaction(async (tx) => {
    await tx
      .delete(financialFilings)
      .where(and(eq(financialFilings.financeEntityId, entityId), eq(financialFilings.periodEnd, parsed.periodEnd)));

    const [filing] = await tx
      .insert(financialFilings)
      .values({
        financeEntityId: entityId,
        periodEnd: parsed.periodEnd,
        sourceFileName,
        sourceFileUrl,
        warnings: parsed.warnings,
        uploadedById,
      })
      .returning();

    for (const statement of parsed.statements) {
      const [statementRow] = await tx
        .insert(financialStatements)
        .values({ filingId: filing.id, statementType: statement.statementType })
        .returning();

      if (statement.lineItems.length > 0) {
        await tx.insert(financialLineItems).values(
          statement.lineItems.map((item) => ({
            statementId: statementRow.id,
            lineNo: item.lineNo,
            code: item.code,
            labelZh: item.labelZh,
            labelKo: item.labelKo,
            side: item.side,
            value: item.value,
            compareValue: item.compareValue,
          }))
        );
      }
    }

    // Backfill the entity's legal name / tax id from the filing the first
    // time we see them, without overwriting a value someone already set.
    if (parsed.taxId || parsed.entityLegalNameZh) {
      const [entity] = await tx.select().from(financeEntities).where(eq(financeEntities.id, entityId)).limit(1);
      if (entity && (!entity.taxId || !entity.legalNameZh)) {
        await tx
          .update(financeEntities)
          .set({
            taxId: entity.taxId ?? parsed.taxId,
            legalNameZh: entity.legalNameZh ?? parsed.entityLegalNameZh,
            updatedAt: new Date(),
          })
          .where(eq(financeEntities.id, entityId));
      }
    }

    return filing;
  });
}
