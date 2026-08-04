// QUALITY_REVIEW agent (mock) — docs/PRD.md section 2 / section 3 / section 8
// ("근거 없는 통계 생성" threat). Checks each channel variant for: missing
// sources behind factual claims, forbidden words, overly-long bodies for the
// channel, duplicate/generic phrasing across channels, and regulatory-
// sensitive overclaims (e.g. "100% 효과", "부작용 없음").

import type { AgentResult } from "@/lib/agent-protocol";
import {
  Channel,
  CHANNEL_LABEL,
  FACTUAL_CLAIM_PATTERN,
  GENERIC_FILLER_PHRASES,
  OVERCLAIM_PATTERNS,
} from "./shared";

export type RiskLevel = "blocker" | "high" | "medium" | "low";

export interface ReviewFindingDraft {
  category: string;
  level: RiskLevel;
  description: string;
  suggestion?: string;
  channel?: Channel;
}

export interface QualityReviewVariant {
  channel: Channel;
  body: string;
  hashtags: string[];
  title?: string;
}

export interface QualityReviewSourceRef {
  url: string;
  label?: string;
  keyClaim?: string;
}

export interface QualityReviewInput {
  variants: QualityReviewVariant[];
  sources: QualityReviewSourceRef[];
  forbiddenWords?: string[];
  taskId?: string;
}

// Channel length norms — see docs/PRD.md section 1 (Instagram short+punchy,
// Threads very short, Blogger long-form SEO).
const LENGTH_LIMITS: Record<Channel, { soft: number; hard?: number }> = {
  INSTAGRAM: { soft: 900 },
  THREADS: { soft: 480, hard: 500 }, // Threads' real platform cap is 500 chars
  BLOGGER: { soft: 200 }, // soft = *minimum* for Blogger (too short hurts SEO)
};

function findFindings(input: QualityReviewInput): ReviewFindingDraft[] {
  const findings: ReviewFindingDraft[] = [];
  const hasSources = input.sources.length > 0;

  for (const variant of input.variants) {
    const label = CHANNEL_LABEL[variant.channel];
    const fullText = [variant.title, variant.body, ...variant.hashtags].filter(Boolean).join(" ");

    // 1. Missing sources behind factual/statistical claims → blocker.
    if (FACTUAL_CLAIM_PATTERN.test(variant.body) && !hasSources) {
      findings.push({
        category: "missing_source",
        level: "blocker",
        channel: variant.channel,
        description: `${label} 본문에 통계/수치 주장이 포함되어 있으나 연결된 출처가 없습니다.`,
        suggestion: "리서치 단계의 sources를 인용하거나, 근거가 없다면 해당 수치 표현을 제거하세요.",
      });
    }

    // 2. Forbidden words present → blocker (body/title) or high (hashtags only).
    for (const word of input.forbiddenWords ?? []) {
      if (!word) continue;
      const inBody = (variant.title ?? "").includes(word) || variant.body.includes(word);
      const inHashtags = variant.hashtags.some((h) => h.includes(word));
      if (inBody) {
        findings.push({
          category: "forbidden_word",
          level: "blocker",
          channel: variant.channel,
          description: `${label} 콘텐츠에 브랜드 금칙어 "${word}"가 포함되어 있습니다.`,
          suggestion: `"${word}" 표현을 제거하거나 완화된 표현으로 대체하세요.`,
        });
      } else if (inHashtags) {
        findings.push({
          category: "forbidden_word",
          level: "high",
          channel: variant.channel,
          description: `${label} 해시태그에 브랜드 금칙어 "${word}"가 포함되어 있습니다.`,
          suggestion: `해당 해시태그를 제거하세요.`,
        });
      }
    }

    // 3. Regulatory-sensitive overclaims → blocker.
    for (const { pattern, label: overclaimLabel } of OVERCLAIM_PATTERNS) {
      if (pattern.test(fullText)) {
        findings.push({
          category: "overclaim",
          level: "blocker",
          channel: variant.channel,
          description: `${label} 콘텐츠에 규제 민감 표현(${overclaimLabel})이 포함되어 있습니다.`,
          suggestion: "단정적 표현을 '관찰됩니다', '~하는 경향이 있습니다' 등 완화된 표현으로 수정하세요.",
        });
      }
    }

    // 4. Overly long / too short body for channel.
    const limits = LENGTH_LIMITS[variant.channel];
    if (variant.channel === "BLOGGER") {
      if (variant.body.length < limits.soft) {
        findings.push({
          category: "length",
          level: "low",
          channel: variant.channel,
          description: `${label} 본문(${variant.body.length}자)이 SEO 장문 콘텐츠로는 다소 짧습니다.`,
          suggestion: "배경 설명이나 시사점 섹션을 보강해 본문을 확장하세요.",
        });
      }
    } else if (limits.hard && variant.body.length > limits.hard) {
      findings.push({
        category: "length",
        level: "high",
        channel: variant.channel,
        description: `${label} 본문(${variant.body.length}자)이 플랫폼 글자수 한도(${limits.hard}자)를 초과합니다.`,
        suggestion: "본문을 핵심만 남기고 축약하세요.",
      });
    } else if (variant.body.length > limits.soft) {
      findings.push({
        category: "length",
        level: "medium",
        channel: variant.channel,
        description: `${label} 본문(${variant.body.length}자)이 권장 길이(${limits.soft}자)보다 깁니다.`,
        suggestion: "핵심 메시지만 남기고 축약하는 것을 권장합니다.",
      });
    }
  }

  // 5. Duplicate body across channels (should be tailored per channel).
  for (let i = 0; i < input.variants.length; i++) {
    for (let j = i + 1; j < input.variants.length; j++) {
      const a = input.variants[i];
      const b = input.variants[j];
      if (a.body.trim().length > 0 && a.body.trim() === b.body.trim()) {
        findings.push({
          category: "duplicate_content",
          level: "high",
          description: `${CHANNEL_LABEL[a.channel]}와 ${CHANNEL_LABEL[b.channel]}의 본문이 동일합니다. 채널별로 다르게 작성되어야 합니다.`,
          suggestion: "채널별 포맷/길이 관행에 맞게 각각 다시 작성하세요.",
        });
      }
    }
  }

  // 6. Generic/clichéd filler phrases repeated across 2+ channels.
  for (const phrase of GENERIC_FILLER_PHRASES) {
    const channelsUsingIt = input.variants.filter((v) => v.body.includes(phrase));
    if (channelsUsingIt.length >= 2) {
      findings.push({
        category: "generic_phrasing",
        level: "low",
        description: `진부한 표현 "${phrase}"가 ${channelsUsingIt.length}개 채널에 반복 사용되었습니다.`,
        suggestion: "채널별로 더 구체적이고 차별화된 문구로 교체하세요.",
      });
    }
  }

  return findings;
}

function levelWeight(level: RiskLevel): number {
  return { blocker: 3, high: 2, medium: 1, low: 0 }[level];
}

export function runQualityReviewAgent(input: QualityReviewInput): AgentResult {
  const taskId = input.taskId ?? `quality-review-${Date.now()}`;
  const findings = findFindings(input);

  const blockerCount = findings.filter((f) => f.level === "blocker").length;
  const highCount = findings.filter((f) => f.level === "high").length;
  const mediumCount = findings.filter((f) => f.level === "medium").length;
  const lowCount = findings.filter((f) => f.level === "low").length;

  const status: AgentResult["status"] = blockerCount > 0 ? "needs_revision" : "completed";

  const confidence = Number(
    Math.max(0.3, Math.min(0.95, 0.95 - blockerCount * 0.2 - highCount * 0.08 - mediumCount * 0.03)).toFixed(2)
  );

  const sortedFindings = [...findings].sort((a, b) => levelWeight(b.level) - levelWeight(a.level));

  return {
    taskId,
    agent: "QUALITY_REVIEW",
    status,
    summary:
      findings.length === 0
        ? "모든 채널 원고가 품질 검수를 통과했습니다 (blocker/high 위험 없음)."
        : `품질 검수 결과 총 ${findings.length}건의 이슈를 발견했습니다 (blocker ${blockerCount}, high ${highCount}, medium ${mediumCount}, low ${lowCount}).`,
    artifacts: [
      {
        type: "review_findings",
        findings: sortedFindings,
      },
    ],
    sources: [],
    assumptions: [
      "출처 부재 판단은 콘텐츠 아이템에 연결된 sources 배열의 존재 여부만 확인하며, 개별 문장-출처 매핑까지는 검증하지 않습니다.",
    ],
    risks: sortedFindings.map((f) => ({
      level: f.level,
      description: f.channel ? `[${CHANNEL_LABEL[f.channel]}] ${f.description}` : f.description,
    })),
    recommendations:
      blockerCount > 0
        ? ["blocker 이슈를 모두 해결한 뒤 재검수를 요청하세요.", ...sortedFindings.filter((f) => f.suggestion).slice(0, 3).map((f) => f.suggestion!)]
        : ["승인 요청 전, 사람이 최종적으로 한 번 더 톤앤매너를 확인하는 것을 권장합니다."],
    confidence,
    nextAction:
      blockerCount > 0
        ? "블로커 이슈를 해결하기 위해 카피라이팅/크리에이티브 단계로 반송합니다."
        : "승인 대기(READY_FOR_APPROVAL) 상태로 전환하도록 오케스트레이터에 통지합니다.",
  };
}
