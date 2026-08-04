// RESEARCH agent (mock) — docs/PRD.md section 2 / section 3.
//
// Phase 1 has no live Xiaohongshu/Douyin crawler or web-search connector, so
// this generates plausible, clearly-fictional "sources" grounded in the
// campaign brief. It follows the PRD's factuality principle: every source is
// labeled with a confidence score, low-confidence sources are flagged as
// assumptions rather than presented as fact, and the whole run is disclosed
// as simulated (mock) research pending real data-connector integration.

import type { AgentResult } from "@/lib/agent-protocol";
import { briefTopic, pickN, seededRng } from "./shared";

export interface ResearchInput {
  campaignBrief: string;
  goal?: string;
  targetPersona?: string;
  taskId?: string;
}

interface SourceTemplate {
  id: string;
  label: string;
  urlSlug: string;
  keyClaim: (topic: string) => string;
  confidence: number;
  daysAgo: number;
  wellGrounded: boolean;
}

const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    id: "xhs-trend",
    label: "샤오홍슈 트렌드 리포트 (mock)",
    urlSlug: "xiaohongshu-trend-report",
    keyClaim: (topic) =>
      `최근 4주간 샤오홍슈에서 "${topic}" 관련 게시물의 노출량이 눈에 띄게 증가하는 추세로 관측됩니다.`,
    confidence: 0.62,
    daysAgo: 6,
    wellGrounded: false,
  },
  {
    id: "douyin-hashtag",
    label: "도우인 해시태그 랭킹 (mock)",
    urlSlug: "douyin-hashtag-ranking",
    keyClaim: (topic) =>
      `도우인 뷰티 카테고리 상위 해시태그 목록에 "${topic}"와 인접한 키워드가 다수 포함되어 있습니다.`,
    confidence: 0.58,
    daysAgo: 3,
    wellGrounded: false,
  },
  {
    id: "kbeauty-benchmark",
    label: "K-뷰티 브랜드 중국 진출 벤치마크 노트 (mock)",
    urlSlug: "kbeauty-china-benchmark-notes",
    keyClaim: (topic) =>
      `유사 카테고리의 한국 브랜드들이 "${topic}"을 소재로 다룰 때 저관여 콘텐츠보다 정보성 콘텐츠 반응이 상대적으로 높았다는 사내 관찰 기록이 있습니다.`,
    confidence: 0.55,
    daysAgo: 21,
    wellGrounded: false,
  },
  {
    id: "derma-regulation",
    label: "피부과/화장품 광고 표현 가이드 메모 (mock)",
    urlSlug: "derma-ad-compliance-notes",
    keyClaim: () =>
      `화장품·의료 인접 카테고리 콘텐츠는 "100% 효과", "부작용 없음"과 같은 단정적 표현을 피해야 한다는 내부 컴플라이언스 메모가 존재합니다.`,
    confidence: 0.85,
    daysAgo: 40,
    wellGrounded: true,
  },
  {
    id: "creator-comment",
    label: "중국 뷰티 크리에이터 댓글 반응 스냅샷 (mock)",
    urlSlug: "creator-comment-snapshot",
    keyClaim: (topic) =>
      `"${topic}"를 언급한 게시물 댓글에서 성분/사용법에 대한 질문 비중이 높게 나타나는 경향이 관찰됩니다(표본 규모 불명확).`,
    confidence: 0.4,
    daysAgo: 9,
    wellGrounded: false,
  },
  {
    id: "competitor-scan",
    label: "경쟁 브랜드 채널 스캔 노트 (mock)",
    urlSlug: "competitor-channel-scan",
    keyClaim: (topic) =>
      `경쟁 브랜드 다수가 "${topic}" 관련 콘텐츠를 캐러셀 형식으로 발행하고 있는 것으로 보이나, 표본 수집 방식이 표준화되어 있지 않습니다.`,
    confidence: 0.45,
    daysAgo: 14,
    wellGrounded: false,
  },
  {
    id: "seasonality",
    label: "시즌성 검색 관심도 메모 (mock)",
    urlSlug: "seasonality-interest-notes",
    keyClaim: (topic) =>
      `"${topic}" 관련 검색 관심도가 계절적 요인의 영향을 받을 가능성이 있다는 추정이나, 정량 데이터 연동 전이라 검증되지 않았습니다.`,
    confidence: 0.35,
    daysAgo: 2,
    wellGrounded: false,
  },
  {
    id: "persona-insight",
    label: "타겟 페르소나 인터뷰 요약 (mock)",
    urlSlug: "persona-interview-summary",
    keyClaim: (topic) =>
      `한국 브랜드 마케터 대상 소규모 인터뷰에서 "${topic}"에 대한 정보 격차를 느낀다는 응답이 있었습니다(표본 소수, 일반화 주의).`,
    confidence: 0.5,
    daysAgo: 17,
    wellGrounded: false,
  },
];

export function runResearchAgent(input: ResearchInput): AgentResult {
  const taskId = input.taskId ?? `research-${Date.now()}`;
  const topic = briefTopic(input.campaignBrief);
  const rng = seededRng(`research:${input.campaignBrief}:${input.goal ?? ""}`);

  const count = 2 + Math.floor(rng() * 3); // 2-4 sources
  const chosen = pickN(rng, SOURCE_TEMPLATES, count);
  // Always keep at least one well-grounded (compliance) source in the mix when available.
  if (!chosen.some((c) => c.wellGrounded)) {
    const compliance = SOURCE_TEMPLATES.find((s) => s.wellGrounded);
    if (compliance) chosen[chosen.length - 1] = compliance;
  }

  const now = Date.now();
  const sources = chosen.map((tpl) => ({
    label: tpl.label,
    url: `https://mock-research.local/${tpl.urlSlug}/${encodeURIComponent(topic).slice(0, 24)}`,
    publishedAt: new Date(now - tpl.daysAgo * 86400000).toISOString(),
    keyClaim: tpl.keyClaim(topic),
    confidence: tpl.confidence,
  }));

  const lowConfidence = chosen.filter((c) => c.confidence < 0.6);

  const assumptions = [
    "Phase 1은 실제 플랫폼 크롤링/API 연동 이전 단계이므로, 위 출처는 mock 리서치 데이터입니다 — 실제 배포 전 사람이 재검증해야 합니다.",
    ...lowConfidence.map(
      (c) => `"${c.label}"의 핵심 주장은 신뢰도가 낮아(${c.confidence.toFixed(2)}) 사실이 아닌 추정으로 간주해야 합니다.`
    ),
  ];

  const risks = lowConfidence.length
    ? [
        {
          level: "medium" as const,
          description: `${lowConfidence.length}개 출처의 신뢰도가 0.6 미만입니다. 후속 단계(전략/카피)에서 이 내용을 단정적 사실로 인용하지 않도록 주의가 필요합니다.`,
        },
      ]
    : [];

  const avgConfidence =
    sources.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / Math.max(sources.length, 1);

  return {
    taskId,
    agent: "RESEARCH",
    status: "completed",
    summary: `"${topic}" 관련 mock 리서치를 완료했습니다. 출처 ${sources.length}건을 수집했으며 평균 신뢰도는 ${avgConfidence.toFixed(2)}입니다.`,
    artifacts: [
      {
        type: "research_notes",
        topic,
        goal: input.goal ?? null,
        targetPersona: input.targetPersona ?? null,
        sourceCount: sources.length,
      },
    ],
    sources,
    assumptions,
    risks,
    recommendations: [
      "전략 에이전트는 위 출처를 인용할 때 신뢰도 0.6 미만 항목은 '추정' 또는 '관찰'로 명시해야 합니다.",
      "실제 배포 전, 최소 1건 이상은 사람이 원문을 확인해 사실관계를 검증하는 것을 권장합니다.",
    ],
    confidence: Number(avgConfidence.toFixed(2)),
    nextAction: "전략 에이전트에게 리서치 결과를 전달하고 콘텐츠 앵글/코어 메시지 도출을 요청합니다.",
  };
}
