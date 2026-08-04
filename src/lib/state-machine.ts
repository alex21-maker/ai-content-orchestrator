// Content status state machine — see docs/PRD.md section 6.
//
//   IDEA → RESEARCHING → DRAFTING → REVIEWING → REVISION_REQUIRED
//     → READY_FOR_APPROVAL → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
//     → MONITORING → ANALYZED
//   Exception states (reachable from anywhere): BLOCKED, FAILED, CANCELED, ARCHIVED

export type ContentStatus =
  | "IDEA"
  | "RESEARCHING"
  | "DRAFTING"
  | "REVIEWING"
  | "REVISION_REQUIRED"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "MONITORING"
  | "ANALYZED"
  | "BLOCKED"
  | "FAILED"
  | "CANCELED"
  | "ARCHIVED";

const HAPPY_PATH: Record<ContentStatus, ContentStatus[]> = {
  IDEA: ["RESEARCHING"],
  RESEARCHING: ["DRAFTING"],
  DRAFTING: ["REVIEWING"],
  REVIEWING: ["REVISION_REQUIRED", "READY_FOR_APPROVAL"],
  REVISION_REQUIRED: ["DRAFTING", "REVIEWING"],
  READY_FOR_APPROVAL: ["APPROVED", "REVISION_REQUIRED"],
  // Editing content/assets after APPROVED invalidates the approval and reverts
  // to the stage BEFORE READY_FOR_APPROVAL (docs/PRD.md section 6: "READY_FOR_APPROVAL
  // 이전 단계로 되돌린다") — that's REVIEWING, not READY_FOR_APPROVAL itself.
  APPROVED: ["SCHEDULED", "REVIEWING"],
  SCHEDULED: ["PUBLISHING", "CANCELED"],
  PUBLISHING: ["PUBLISHED", "FAILED"],
  PUBLISHED: ["MONITORING"],
  MONITORING: ["ANALYZED"],
  ANALYZED: [],
  BLOCKED: ["DRAFTING", "ARCHIVED"],
  FAILED: ["SCHEDULED", "ARCHIVED"],
  CANCELED: ["ARCHIVED"],
  ARCHIVED: [],
};

// Exception states are reachable from any non-terminal status.
const EXCEPTION_STATES: ContentStatus[] = ["BLOCKED", "FAILED", "CANCELED", "ARCHIVED"];

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  if (from === to) return false;
  if (EXCEPTION_STATES.includes(to)) return true;
  return HAPPY_PATH[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: ContentStatus, to: ContentStatus) {
    super(`Cannot transition content from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: ContentStatus, to: ContentStatus) {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** After MAX_REVISION_ROUNDS, don't loop REVIEWING↔REVISION_REQUIRED again — escalate to BLOCKED for a human call. */
export const MAX_REVISION_ROUNDS = 3;

export function nextRevisionStatus(currentRound: number): ContentStatus {
  return currentRound >= MAX_REVISION_ROUNDS ? "BLOCKED" : "REVISION_REQUIRED";
}
