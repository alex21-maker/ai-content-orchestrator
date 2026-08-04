// STRATEGY agent (mock) — docs/PRD.md section 2 / section 3.
// Takes the RESEARCH agent's AgentResult as an input assumption and produces
// a channel content matrix, core message, and CTA recommendation.

import type { AgentResult } from "@/lib/agent-protocol";
import { briefTopic, Channel, pick, seededRng } from "./shared";

export interface ContentMatrixRow {
  channel: Channel;
  angle: string;
  format: string;
  hook: string;
}

export interface StrategyArtifact {
  type: "content_strategy";
  coreMessage: string;
  cta: string;
  contentMatrix: ContentMatrixRow[];
  keyDifferentiators: string[];
  risksToAvoid: string[];
}

export interface StrategyInput {
  campaignBrief: string;
  goal?: string;
  targetPersona?: string;
  /** RESEARCH agent's full result — used as an input assumption for grounding. */
  research: AgentResult;
  taskId?: string;
}

const CORE_MESSAGE_FRAMES = [
  (topic: string) => `"${topic}"는 지금 중국 뷰티 플랫폼에서 관찰되는 흐름이며, 한국 브랜드가 선제적으로 참고할 만한 신호입니다.`,
  (topic: string) => `"${topic}" 관련 움직임을 데이터 기반으로 짚어보고, 한국 브랜드 마케팅팀이 취할 수 있는 실행 포인트를 제시합니다.`,
  (topic: string) => `"${topic}"를 둘러싼 샤오홍슈·도우인 반응을 정리해, 과장 없이 사실과 추정을 구분한 인사이트를 전달합니다.`,
];

const CTA_BY_GOAL: { match: RegExp; cta: string }[] = [
  { match: /구독|뉴스레터/, cta: "매주 발행되는 중국 마케팅 인사이트 뉴스레터를 구독하도록 유도합니다." },
  { match: /팔로우|팔로워|계정\s*성장/, cta: "@lablab_ai 계정 팔로우 및 프로필 링크 클릭을 유도합니다." },
  { match: /상담|리드|문의/, cta: "브랜드 진출/마케팅 상담 신청 링크 클릭을 유도합니다." },
  { match: /인지도|브랜딩/, cta: "댓글로 자사 브랜드가 겪는 유사 고민을 공유하도록 유도해 인게이지먼트를 높입니다." },
];
const DEFAULT_CTA = "프로필 링크의 블로그 원문에서 심화 데이터를 확인하도록 유도합니다.";

const DIFFERENTIATOR_POOL = [
  "샤오홍슈·도우인 원문 관찰을 근거와 추정으로 구분해 제시",
  "한국 뷰티/헬스푸드/피부과 브랜드 마케터 실무 관점에서 재해석",
  "과장 광고 표현 없이 데이터 기반 톤 유지",
  "채널별로 동일 소재를 다른 포맷(카드뉴스/단문/장문)으로 재구성",
];

export function runStrategyAgent(input: StrategyInput): AgentResult {
  const taskId = input.taskId ?? `strategy-${Date.now()}`;
  const topic = briefTopic(input.campaignBrief);
  const rng = seededRng(`strategy:${input.campaignBrief}:${input.goal ?? ""}:${input.targetPersona ?? ""}`);

  const coreMessage = pick(rng, CORE_MESSAGE_FRAMES)(topic);
  const cta =
    CTA_BY_GOAL.find((c) => input.goal && c.match.test(input.goal))?.cta ?? DEFAULT_CTA;

  const contentMatrix: ContentMatrixRow[] = [
    {
      channel: "INSTAGRAM",
      angle: "핵심 트렌드를 요약한 카드뉴스형 캐러셀",
      format: "캐러셀(이미지 4~6장)",
      hook: `"${topic}", 지금 중국에서 무슨 일이?`,
    },
    {
      channel: "THREADS",
      angle: "한 호흡에 읽히는 팩트체크형 단문",
      format: "단문 텍스트",
      hook: `${topic} — 요약 3줄`,
    },
    {
      channel: "BLOGGER",
      angle: "SEO 장문 분석 아티클로 근거와 실행 포인트 정리",
      format: "장문 아티클(H2/H3 구조)",
      hook: `${topic}: 데이터로 보는 중국 마케팅 시사점`,
    },
  ];

  const keyDifferentiators = [
    ...DIFFERENTIATOR_POOL.slice(0, 2),
    ...(input.targetPersona ? [`${input.targetPersona}의 실무 의사결정에 바로 쓸 수 있는 형태로 요약`] : []),
  ];

  const lowConfidenceSources = input.research.sources.filter((s) => (s.confidence ?? 1) < 0.6);
  const risksToAvoid = [
    "출처 없는 통계/효과 단정 표현 사용 금지",
    "브랜드 금칙어(예: 100% 보장, 즉시 효과, 부작용 없음) 사용 금지",
    ...(lowConfidenceSources.length
      ? [`리서치 신뢰도 낮은 항목(${lowConfidenceSources.length}건)을 사실처럼 인용하지 않기`]
      : []),
  ];

  const artifact: StrategyArtifact = { type: "content_strategy", coreMessage, cta, contentMatrix, keyDifferentiators, risksToAvoid };

  const assumptions = [
    `리서치 단계 결과(신뢰도 평균 ${input.research.confidence.toFixed(2)})를 기반 가정으로 삼아 전략을 수립했습니다.`,
    ...input.research.assumptions,
  ];

  const confidence = Number(
    Math.min(0.9, Math.max(0.4, input.research.confidence * 0.9 + 0.05)).toFixed(2)
  );

  return {
    taskId,
    agent: "STRATEGY",
    status: "completed",
    summary: `"${topic}"에 대한 3채널(인스타그램/쓰레드/블로거) 콘텐츠 전략과 코어 메시지, CTA를 수립했습니다.`,
    artifacts: [artifact],
    // Pass research sources through so the orchestrator persists a single,
    // strategy-vetted set of sources for this content item.
    sources: input.research.sources,
    assumptions,
    risks: input.research.risks,
    recommendations: [
      "카피라이팅 에이전트는 contentMatrix의 채널별 angle/hook을 우선 반영해야 합니다.",
      "크리에이티브 에이전트는 채널별 format에 맞는 비주얼 브리프를 작성해야 합니다.",
    ],
    confidence,
    nextAction: "카피라이팅·크리에이티브 에이전트를 채널별로 병렬 실행합니다.",
  };
}
