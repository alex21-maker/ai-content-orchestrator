// Append-only audit log writer. This is the ONLY function in the codebase
// that should INSERT into audit_logs — never expose an update/delete path
// for this table (docs/PRD.md section 8).

import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type ActorType = "user" | "agent" | "system";

export async function recordAudit(entry: {
  organizationId: string;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    organizationId: entry.organizationId,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ?? null,
  });
}
