// CREATIVE agent (mock) — docs/PRD.md section 2-E.
// "영상 생성이 지원되지 않으면 제작 브리프 제공" — Phase 1 has no image/video
// generation provider, so this produces a text-only production brief: concept
// description, shot list (for video formats), and brand color/ratio spec.

import type { AgentResult } from "@/lib/agent-protocol";
import { briefTopic, Channel, CHANNEL_LABEL, pick, seededRng, truncate } from "./shared";

export interface CreativeArtifact {
  type: "creative_brief";
  channel: Channel;
  concept: string;
  visualFormat: string;
  aspectRatio: string;
  colorPalette: string[];
  shotList?: string[];
  altTextSuggestion: string;
  productionNotes: string[];
}

export interface CreativeInput {
  channel: Channel;
  brief: string;
  goal?: string;
  brandColors?: string[];
  angle?: string;
  hook?: string;
  taskId?: string;
}

const DEFAULT_PALETTE = ["#5C7A63 (브랜드 그린)", "#FAF9F6 (배경 아이보리)", "#1F2420 (텍스트 잉크)"];

const CHANNEL_SPEC: Record<
  Channel,
  { visualFormat: string; aspectRatio: string; shots: (topic: string) => string[] | undefined }
> = {
  INSTAGRAM: {
    visualFormat: "캐러셀(이미지 4~6장) — 표지/데이터 요약/시사점/CTA 구성",
    aspectRatio: "4:5 (피드) 또는 9:16 (스토리 재활용)",
    shots: (topic) => [
      `1번 슬라이드: 후킹 타이틀 — "${topic}" 키워드를 큼직한 타이포로 배치`,
      `2번 슬라이드: 관찰된 데이터/트렌드 요약 (숫자·그래프 아이콘 활용, 출처 각주 표기)`,
      `3번 슬라이드: 한국 브랜드 마케터를 위한 시사점 2~3가지`,
      `4번 슬라이드: 브랜드 CTA + 프로필 링크 안내`,
    ],
  },
  THREADS: {
    visualFormat: "단일 정사각 이미지(선택) — 텍스트 위주 포스트라 이미지는 보조 요소",
    aspectRatio: "1:1",
    shots: () => undefined,
  },
  BLOGGER: {
    visualFormat: "히어로 배너 이미지 1장 + 본문 내 인포그래픽 1~2장",
    aspectRatio: "16:9 (히어로) / 1:1 (본문 인포그래픽)",
    shots: (topic) => [
      `히어로 이미지: "${topic}"를 은유하는 편집숍/플랫폼 UI 콜라주 스타일 목업`,
      `본문 인포그래픽: 핵심 수치 1~2개를 카드형 그래픽으로 시각화 (출처 각주 필수)`,
    ],
  },
};

const CONCEPT_FRAMES = [
  (topic: string, channel: Channel) =>
    `${CHANNEL_LABEL[channel]} 톤에 맞춰 "${topic}"를 데이터 리포트 느낌으로 시각화합니다 — 과장된 이미지보다 정보 전달력을 우선합니다.`,
  (topic: string, channel: Channel) =>
    `"${topic}"를 다루는 ${CHANNEL_LABEL[channel]} 콘텐츠의 신뢰도를 높이기 위해, 절제된 브랜드 컬러와 명확한 타이포 위계를 사용한 카드 스타일을 제안합니다.`,
];

export function runCreativeAgent(input: CreativeInput): AgentResult {
  const taskId = input.taskId ?? `creative-${input.channel}-${Date.now()}`;
  const topic = briefTopic(input.brief);
  const rng = seededRng(`creative:${input.channel}:${input.brief}`);
  const spec = CHANNEL_SPEC[input.channel];

  const concept = pick(rng, CONCEPT_FRAMES)(topic, input.channel);
  const shotList = spec.shots(topic);
  const palette = input.brandColors && input.brandColors.length > 0 ? input.brandColors : DEFAULT_PALETTE;

  const artifact: CreativeArtifact = {
    type: "creative_brief",
    channel: input.channel,
    concept,
    visualFormat: spec.visualFormat,
    aspectRatio: spec.aspectRatio,
    colorPalette: palette,
    shotList,
    altTextSuggestion: truncate(`"${topic}" 관련 ${CHANNEL_LABEL[input.channel]} 콘텐츠 대표 이미지`, 120),
    productionNotes: [
      "Phase 1은 실제 이미지/영상 생성을 지원하지 않으므로, 위 내용은 디자이너/외부 툴이 참고할 제작 브리프입니다.",
      "브랜드 로고와 계정 핸들(@lablab_ai)을 슬라이드/이미지 하단에 일관되게 배치하세요.",
      "출처가 필요한 수치를 이미지에 표기할 경우 반드시 각주 또는 캡션으로 출처를 함께 표시하세요.",
    ],
  };

  return {
    taskId,
    agent: "CREATIVE",
    status: "completed",
    summary: `${CHANNEL_LABEL[input.channel]} 채널용 제작 브리프(텍스트)를 생성했습니다. 실제 이미지/영상 생성은 Phase 2 범위입니다.`,
    artifacts: [artifact],
    sources: [],
    assumptions: [
      "이미지/영상 생성 도구가 아직 연동되지 않아 실제 에셋 대신 제작 브리프만 제공합니다.",
    ],
    risks: [],
    recommendations: [
      "디자이너가 브리프를 기반으로 실제 에셋을 제작한 뒤 assets 테이블에 등록해야 합니다.",
    ],
    confidence: 0.7,
    nextAction: "품질검수 에이전트가 카피와 함께 이 브리프의 브랜드 정합성을 검토합니다.",
  };
}
