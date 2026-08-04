import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  InvalidTransitionError,
  nextRevisionStatus,
  MAX_REVISION_ROUNDS,
} from "@/lib/state-machine";

describe("state machine", () => {
  it("allows the full happy path in order", () => {
    const path = [
      "IDEA",
      "RESEARCHING",
      "DRAFTING",
      "REVIEWING",
      "READY_FOR_APPROVAL",
      "APPROVED",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "MONITORING",
      "ANALYZED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("rejects skipping stages (the core anti-cheat invariant)", () => {
    expect(canTransition("IDEA", "APPROVED")).toBe(false);
    expect(canTransition("READY_FOR_APPROVAL", "PUBLISHED")).toBe(false);
    expect(canTransition("DRAFTING", "PUBLISHING")).toBe(false);
  });

  it("never allows a transition to itself", () => {
    expect(canTransition("APPROVED", "APPROVED")).toBe(false);
  });

  it("allows editing after APPROVED to revert to REVIEWING (not READY_FOR_APPROVAL)", () => {
    // This is the exact bug two parallel agents flagged and I fixed during
    // integration — see docs/PRD.md section 6: reverts to the stage BEFORE
    // READY_FOR_APPROVAL, i.e. REVIEWING.
    expect(canTransition("APPROVED", "REVIEWING")).toBe(true);
    expect(canTransition("APPROVED", "READY_FOR_APPROVAL")).toBe(false);
  });

  it("allows exception states from anywhere non-terminal", () => {
    expect(canTransition("DRAFTING", "BLOCKED")).toBe(true);
    expect(canTransition("PUBLISHING", "CANCELED")).toBe(true);
    expect(canTransition("REVIEWING", "ARCHIVED")).toBe(true);
  });

  it("assertTransition throws InvalidTransitionError on an illegal hop", () => {
    expect(() => assertTransition("IDEA", "PUBLISHED")).toThrow(InvalidTransitionError);
  });

  it("assertTransition does not throw on a legal hop", () => {
    expect(() => assertTransition("IDEA", "RESEARCHING")).not.toThrow();
  });

  it("escalates to BLOCKED once revision rounds are exhausted", () => {
    expect(nextRevisionStatus(0)).toBe("REVISION_REQUIRED");
    expect(nextRevisionStatus(MAX_REVISION_ROUNDS - 1)).toBe("REVISION_REQUIRED");
    expect(nextRevisionStatus(MAX_REVISION_ROUNDS)).toBe("BLOCKED");
    expect(nextRevisionStatus(MAX_REVISION_ROUNDS + 1)).toBe("BLOCKED");
  });
});
