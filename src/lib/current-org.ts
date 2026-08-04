// Phase 1 has no organization-switcher UI yet — a signed-in user's "current"
// org is simply their first membership. Multi-org switching is straightforward
// to add later (this function is the single seam) but out of scope for MVP.

import { db } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUserId } from "@/lib/session";
import type { Role } from "@/lib/rbac";

export async function requireCurrentOrg(): Promise<{
  organizationId: string;
  organizationName: string;
  role: Role;
  userId: string;
}> {
  const userId = await requireUserId();
  const [row] = await db
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
      organizationName: organizations.name,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .limit(1);

  if (!row) throw new Error("이 사용자는 어떤 조직에도 속해 있지 않습니다.");
  return { organizationId: row.organizationId, organizationName: row.organizationName, role: row.role as Role, userId };
}
