// Role-based access control helpers.
// Every server action / API route must re-check role from the session on
// every request — never trust a role value sent from the client.
// See docs/PRD.md section 8 (보안 위협 모델 — 권한 상승).

export type Role = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";

const ROLE_RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  REVIEWER: 1,
  VIEWER: 0,
};

/** True if `role` is at least as privileged as `min`. */
export function atLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Only OWNER/ADMIN may give final approval or trigger a (mock) publish. */
export function canApprove(role: Role): boolean {
  return atLeast(role, "ADMIN");
}

/** EDITOR and above may create/edit campaigns and content. */
export function canEdit(role: Role): boolean {
  return atLeast(role, "EDITOR");
}

/** REVIEWER and above may comment / request revisions. */
export function canComment(role: Role): boolean {
  return atLeast(role, "REVIEWER");
}

/** Only OWNER may manage organization membership and billing. */
export function canManageOrg(role: Role): boolean {
  return atLeast(role, "OWNER");
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError if the role does not satisfy the predicate. Use at the top of every server action. */
export function assertRole(role: Role, predicate: (role: Role) => boolean, message?: string) {
  if (!predicate(role)) {
    throw new ForbiddenError(message ?? `Role ${role} is not permitted to perform this action`);
  }
}
