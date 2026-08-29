// Orchestration engine (mock) — docs/PRD.md section 2 (오케스트레이터) / 3 / 6.
//
// Drives one ContentItem through RESEARCH → STRATEGY →
// (COPYWRITING × channel + CREATIVE × channel) → QUALITY_REVIEW, persisting
// every agent's run + message, writing channel variants / sources / review
// findings, and advancing the content status state machine accordingly.
//
// Phase 1 note (docs/PRD.md section 4): agents are synchronous mocks, so this
// runs entirely within one request — no durable queue needed yet.

import { db } from "@/db";
import {
  agentMessages,
  agentRuns,
  brandProfiles,
  campaigns,
  channelVariants,
  contentItems,
  contentStatusEvents,
  reviewFindings,
  sources as sourcesTable,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AgentResult, AgentStatus } from "@/lib/agent-protocol";
import { assertTransition, ContentStatus, nextRevisionStatus } from "@/lib/state-machine";
import { recordAudit } from "@/lib/audit";
import { runResearchAgent } from "./research";
import { runStrategyAgent, StrategyArtifact } from "./strategy";
import { runCopywritingAgent, CopyArtifact } from "./copywriting";
import { runCreativeAgent, CreativeArtifact } from "./creative";
import { runQualityReviewAgent, ReviewFindingDraft } from "./quality-review";
import type { Channel } from "./shared";

const CHANNELS: Channel[] = ["INSTAGRAM", "THREADS", "BLOGGER"];

export function toDbAgentRunStatus(status: AgentStatus): "COMPLETED" | "NEEDS_REVISION" | "BLOCKED" | "FAILED" {
  switch (status) {
    case "completed":
      return "COMPLETED";
    case "needs_revision":
      return "NEEDS_REVISION";
    case "blocked":
      return "BLOCKED";
    case "failed":
      return "FAILED";
  }
}

function toDbRiskLevel(level: "blocker" | "high" | "medium" | "low"): "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" {
  return level.toUpperCase() as "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";
}

export class OrchestrationError extends Error {}

/** Persists an AgentResult as one agentRuns row + one linked agentMessages row. */
async function persistAgentResult(
  ctx: {
    campaignId: string;
    contentItemId: string;
    agentType: "RESEARCH" | "STRATEGY" | "COPYWRITING" | "CREATIVE" | "QUALITY_REVIEW";
  },
  result: AgentResult
) {
  const [run] = await db
    .insert(agentRuns)
    .values({
      campaignId: ctx.campaignId,
      contentItemId: ctx.contentItemId,
      agentType: ctx.agentType,
      taskId: result.taskId,
      status: toDbAgentRunStatus(result.status),
      summary: result.summary,
      confidence: result.confidence,
      finishedAt: new Date(),
    })
    .returning();

  await db.insert(agentMessages).values({
    agentRunId: run.id,
    artifacts: result.artifacts,
    sources: result.sources,
    assumptions: result.assumptions,
    risks: result.risks,
    recommendations: result.recommendations,
    nextAction: result.nextAction,
  });

  return run;
}

async function transitionStatus(
  contentItemId: string,
  from: ContentStatus,
  to: ContentStatus,
  reason: string
): Promise<ContentStatus> {
  assertTransition(from, to);
  await db.update(contentItems).set({ status: to, updatedAt: new Date() }).where(eq(contentItems.id, contentItemId));
  await db.insert(contentStatusEvents).values({
    contentItemId,
    fromStatus: from,
    toStatus: to,
    actorType: "agent",
    actorId: "agent:orchestrator",
    reason,
  });
  return to;
}

/**
 * Entry states the orchestrator may (re-)start from, and how each maps onto
 * the RESEARCHING → DRAFTING → REVIEWING chain — see docs/PRD.md section 6.
 * REVISION_REQUIRED/BLOCKED re-entries deliberately skip RESEARCHING (that
 * hop is only valid from IDEA in the state machine); the STRATEGY/RESEARCH
 * agents still re-run for fresh context, but that doesn't require a DB
 * status hop through RESEARCHING.
 */
const ENTRY_STATES: ContentStatus[] = ["IDEA", "RESEARCHING", "DRAFTING", "REVIEWING", "REVISION_REQUIRED", "BLOCKED"];

export async function runOrchestration(contentItemId: string): Promise<{ finalStatus: ContentStatus }> {
  const [row] = await db
    .select({ contentItem: contentItems, campaign: campaigns })
    .from(contentItems)
    .innerJoin(campaigns, eq(campaigns.id, contentItems.campaignId))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  if (!row) throw new OrchestrationError(`콘텐츠 아이템을 찾을 수 없습니다: ${contentItemId}`);
  const { contentItem, campaign } = row;

  const brandProfile = campaign.brandProfileId
    ? (await db.select().from(brandProfiles).where(eq(brandProfiles.id, campaign.brandProfileId)).limit(1))[0]
    : undefined;

  let current = contentItem.status as ContentStatus;
  if (!ENTRY_STATES.includes(current)) {
    throw new OrchestrationError(`콘텐츠 상태(${current})에서는 에이전트를 실행할 수 없습니다.`);
  }

  const persistCtx = { campaignId: campaign.id, contentItemId };

  // --- RESEARCHING (only reachable from IDEA — see ENTRY_STATES comment) ---
  if (current === "IDEA") {
    current = await transitionStatus(contentItemId, current, "RESEARCHING", "오케스트레이션 시작: 리서치 단계 진입");
  }

  const researchResult = runResearchAgent({
    campaignBrief: campaign.brief,
    goal: campaign.goal ?? undefined,
    targetPersona: campaign.targetPersona ?? undefined,
    taskId: contentItemId,
  });
  await persistAgentResult({ ...persistCtx, agentType: "RESEARCH" }, researchResult);

  const strategyResult = runStrategyAgent({
    campaignBrief: campaign.brief,
    goal: campaign.goal ?? undefined,
    targetPersona: campaign.targetPersona ?? undefined,
    research: researchResult,
    taskId: contentItemId,
  });
  await persistAgentResult({ ...persistCtx, agentType: "STRATEGY" }, strategyResult);

  const strategyArtifact = strategyResult.artifacts.find(
    (a): a is StrategyArtifact => typeof a === "object" && a !== null && (a as StrategyArtifact).type === "content_strategy"
  );

  // Persist STRATEGY's (research-derived) sources against this content item.
  for (const source of strategyResult.sources) {
    await db.insert(sourcesTable).values({
      contentItemId,
      label: source.label,
      url: source.url,
      publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
      keyClaim: source.keyClaim ?? null,
      confidence: source.confidence ?? null,
      // No dedicated "unclear/low-confidence" flag exists in the schema yet
      // (TODO(schema): add sources.isUnclear); reuse isStale as the closest
      // proxy so low-confidence mock sources are visibly flagged in the UI.
      isStale: (source.confidence ?? 1) < 0.5,
    });
  }

  // --- DRAFTING ------------------------------------------------------------
  if (current !== "DRAFTING" && current !== "REVIEWING") {
    current = await transitionStatus(
      contentItemId,
      current,
      "DRAFTING",
      current === "REVISION_REQUIRED" || current === "BLOCKED"
        ? "수정 라운드 재시작: 초안 재작성 단계 진입"
        : "전략 수립 완료: 초안 작성 단계 진입"
    );
  }

  const copyByChannel: Partial<Record<Channel, CopyArtifact>> = {};

  for (const channel of CHANNELS) {
    const matrixRow = strategyArtifact?.contentMatrix.find((m) => m.channel === channel);

    const copyResult = runCopywritingAgent({
      channel,
      brief: campaign.brief,
      goal: campaign.goal ?? undefined,
      targetPersona: campaign.targetPersona ?? undefined,
      toneOfVoice: brandProfile?.toneOfVoice ?? undefined,
      forbiddenWords: brandProfile?.forbiddenWords ?? undefined,
      coreMessage: strategyArtifact?.coreMessage,
      cta: strategyArtifact?.cta,
      hook: matrixRow?.hook,
      angle: matrixRow?.angle,
      taskId: contentItemId,
    });
    await persistAgentResult({ ...persistCtx, agentType: "COPYWRITING" }, copyResult);
    const copyArtifact = copyResult.artifacts.find(
      (a): a is CopyArtifact => typeof a === "object" && a !== null && (a as CopyArtifact).type === "channel_copy"
    );
    if (copyArtifact) {
      copyByChannel[channel] = copyArtifact;
      await db.insert(channelVariants).values({
        contentItemId,
        channel,
        title: copyArtifact.title ?? null,
        body: copyArtifact.body,
        hashtags: copyArtifact.hashtags,
        ctaText: copyArtifact.ctaText ?? null,
        altText: copyArtifact.altText ?? null,
        version: 1,
        createdBy: "agent:copywriting",
      });
    }

    const creativeResult = runCreativeAgent({
      channel,
      brief: campaign.brief,
      goal: campaign.goal ?? undefined,
      brandColors: undefined,
      angle: matrixRow?.angle,
      hook: matrixRow?.hook,
      taskId: contentItemId,
    });
    await persistAgentResult({ ...persistCtx, agentType: "CREATIVE" }, creativeResult);
    const creativeArtifact = creativeResult.artifacts.find(
      (a): a is CreativeArtifact => typeof a === "object" && a !== null && (a as CreativeArtifact).type === "creative_brief"
    );
    if (creativeArtifact) {
      const briefBody = [
        `[크리에이티브 브리프] ${creativeArtifact.concept}`,
        `포맷: ${creativeArtifact.visualFormat} (비율 ${creativeArtifact.aspectRatio})`,
        `컬러: ${creativeArtifact.colorPalette.join(", ")}`,
        ...(creativeArtifact.shotList ? [`샷 리스트:\n- ${creativeArtifact.shotList.join("\n- ")}`] : []),
        `제작 노트:\n- ${creativeArtifact.productionNotes.join("\n- ")}`,
      ].join("\n\n");

      await db.insert(channelVariants).values({
        contentItemId,
        channel,
        title: `[크리에이티브 브리프] ${channel}`,
        body: briefBody,
        hashtags: [],
        ctaText: null,
        altText: creativeArtifact.altTextSuggestion,
        version: 1,
        createdBy: "agent:creative",
      });
    }
  }

  // --- REVIEWING -------------------------------------------------------------
  if (current !== "REVIEWING") {
    current = await transitionStatus(contentItemId, current, "REVIEWING", "채널별 초안 작성 완료: 품질 검수 단계 진입");
  }

  const reviewVariants = CHANNELS.filter((c) => copyByChannel[c]).map((c) => ({
    channel: c,
    body: copyByChannel[c]!.body,
    hashtags: copyByChannel[c]!.hashtags,
    title: copyByChannel[c]!.title,
  }));

  const qualityResult = runQualityReviewAgent({
    variants: reviewVariants,
    sources: strategyResult.sources.map((s) => ({ url: s.url, label: s.label, keyClaim: s.keyClaim })),
    forbiddenWords: brandProfile?.forbiddenWords ?? undefined,
    taskId: contentItemId,
  });
  await persistAgentResult({ ...persistCtx, agentType: "QUALITY_REVIEW" }, qualityResult);

  const findingsArtifact = qualityResult.artifacts.find(
    (a): a is { type: "review_findings"; findings: ReviewFindingDraft[] } =>
      typeof a === "object" && a !== null && (a as { type?: string }).type === "review_findings"
  );

  for (const finding of findingsArtifact?.findings ?? []) {
    await db.insert(reviewFindings).values({
      contentItemId,
      category: finding.category,
      riskLevel: toDbRiskLevel(finding.level),
      description: finding.channel ? `[${finding.channel}] ${finding.description}` : finding.description,
      suggestion: finding.suggestion ?? null,
      resolved: false,
    });
  }

  const hasBlocker = (findingsArtifact?.findings ?? []).some((f) => f.level === "blocker");

  // --- REVIEWING -> READY_FOR_APPROVAL | REVISION_REQUIRED | BLOCKED -------
  let finalStatus: ContentStatus;
  if (hasBlocker) {
    const revisionRound = contentItem.revisionRound;
    const target = nextRevisionStatus(revisionRound);
    if (target === "REVISION_REQUIRED") {
      await db
        .update(contentItems)
        .set({ revisionRound: revisionRound + 1, updatedAt: new Date() })
        .where(eq(contentItems.id, contentItemId));
    }
    finalStatus = await transitionStatus(
      contentItemId,
      current,
      target,
      target === "BLOCKED"
        ? `최대 수정 라운드(${revisionRound})에 도달하여 관리자 판단이 필요합니다.`
        : "품질 검수에서 blocker 위험이 발견되어 수정이 필요합니다."
    );
  } else {
    finalStatus = await transitionStatus(contentItemId, current, "READY_FOR_APPROVAL", "품질 검수 통과: 승인 대기 상태로 전환");
  }

  await recordAudit({
    organizationId: campaign.organizationId,
    actorType: "agent",
    actorId: "agent:orchestrator",
    action: "orchestration.run",
    targetType: "content_item",
    targetId: contentItemId,
    metadata: {
      finalStatus,
      hasBlocker,
      findingCount: findingsArtifact?.findings.length ?? 0,
      qualityStatus: qualityResult.status,
    },
  });

  return { finalStatus };
}
