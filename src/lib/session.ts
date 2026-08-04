import { auth } from "@/lib/auth";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { Role } from "@/lib/rbac";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

/** Returns the signed-in user's id, or throws. Every server action/API route starts here. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

/**
 * Returns the caller's role within `organizationId`, re-derived from the DB
 * on every call — never trust a role claimed by the client (docs/PRD.md
 * section 8, "권한 상승" threat).
 */
export async function requireMembership(organizationId: string): Promise<{ userId: string; role: Role }> {
  const userId = await requireUserId();
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);

  if (!membership) throw new UnauthorizedError();
  return { userId, role: membership.role as Role };
}
