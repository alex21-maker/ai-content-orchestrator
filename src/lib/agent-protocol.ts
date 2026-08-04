// Common agent-to-agent JSON protocol.
// Mirrors docs/PRD.md section 3 / the master prompt's section 3 exactly —
// every mock agent in src/lib/agents/* returns this shape, and it is stored
// verbatim (minus taskId/agent/status/summary/confidence/nextAction, which
// get their own columns) as AgentMessage.artifacts/sources/etc.

import { z } from "zod";

export const AgentStatus = z.enum(["completed", "needs_revision", "blocked", "failed"]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentResultSchema = z.object({
  taskId: z.string(),
  agent: z.string(),
  status: AgentStatus,
  summary: z.string(),
  artifacts: z.array(z.unknown()).default([]),
  sources: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
        publishedAt: z.string().optional(),
        keyClaim: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .default([]),
  assumptions: z.array(z.string()).default([]),
  risks: z
    .array(
      z.object({
        level: z.enum(["blocker", "high", "medium", "low"]),
        description: z.string(),
      })
    )
    .default([]),
  recommendations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  nextAction: z.string(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

/** Orchestrator collaboration flow — fixed order, matches docs/PRD.md section 3. */
export const ORCHESTRATION_FLOW = [
  "RESEARCH",
  "STRATEGY",
  "COPYWRITING", // runs in parallel with CREATIVE
  "CREATIVE", // runs in parallel with COPYWRITING
  "QUALITY_REVIEW",
] as const;

export const MAX_REVISION_ROUNDS = 3;
