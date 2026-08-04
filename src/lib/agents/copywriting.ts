// COPYWRITING agent (mock) — docs/PRD.md section 2 / section 3.
// Generates channel-specific copy respecting each channel's length/format
// norms and the brand's tone of voice + forbidden words.

import type { AgentResult } from "@/lib/agent-protocol";
import {
  briefTopic,
  Channel,
  CHANNEL_LABEL,
  pick,
  pickN,
  scrubForbiddenWords,
  seededRng,
  truncate,
} from "./shared";

export interface CopyArtifact {
  type: "channel_copy";
  channel: Channel;
  title?: string;
  body: string;
  hashtags: string[];
  ctaText?: string;
  altText?: string;
}

export interface CopywritingInput {
  channel: Channel;
  brief: string;
  goal?: string;
  targetPersona?: string;
  toneOfVoice?: string;
  forbiddenWords?: string[];
  /** Optional context carried over from the STRATEGY step, for coherence. */
  coreMessage?: string;
  cta?: string;
  hook?: string;
  angle?: string;
  taskId?: string;
}

const OPENERS = [
  (topic: string) => `요즘 샤오홍슈·도우인에서 "${topic}" 이야기가 자주 보입니다.`,
  (topic: string) => `"${topic}", 최근 중국 뷰티 플랫폼에서 관찰되는 흐름을 짧게 정리했습니다.`,
  (topic: string) => `중국 뷰티 콘텐츠를 매일 살펴보다 "${topic}"에서 몇 가지 신호가 보여 공유합니다.`,
];

const TONE_SENTENCES: Record<string, string[]> = {
  default: [
    "숫자와 근거를 구분해서, 과장 없이 전달하는 것을 원칙으로 합니다.",
    "확정된 사실과 관찰/추정을 나누어 정리했습니다.",
  ],
  trust: [
    "단정적인 표현 대신, 확인된 사실과 아직 검증 중인 추정을 나누어 안내드립니다.",
    "신뢰할 수 있는 근거를 우선하고, 불확실한 부분은 불확실하다고 그대로 밝힙니다.",
  ],
};

const CORE_HASHTAGS = ["중국마케팅", "샤오홍슈", "도우인"];
const EXTRA_HASHTAG_POOL = [
  "K뷰티",
  "뷰티마케팅",
  "헬스푸드",
  "피부과마케팅",
  "브랜드마케팅",
  "콘텐츠전략",
  "마케팅인사이트",
];

function toneSentences(toneOfVoice?: string): string[] {
  if (!toneOfVoice) return TONE_SENTENCES.default;
  return /신뢰|전문|데이터/.test(toneOfVoice) ? TONE_SENTENCES.trust : TONE_SENTENCES.default;
}

function buildInstagram(input: CopywritingInput, topic: string, rng: () => number) {
  const opener = input.hook ? `${input.hook}` : pick(rng, OPENERS)(topic);
  const tone = pick(rng, toneSentences(input.toneOfVoice));
  const coreMessage = input.coreMessage ?? `"${topic}" 관련 흐름을 카드뉴스로 정리했습니다.`;

  const body = [
    `${opener}`,
    "",
    coreMessage,
    tone,
    "",
    "스와이프해서 핵심 포인트 4가지를 확인해보세요 →",
  ].join("\n");

  const hashtags = [...new Set([...CORE_HASHTAGS, ...pickN(rng, EXTRA_HASHTAG_POOL, 3), "lablab_ai"])].slice(0, 10);

  return {
    title: undefined,
    body: truncate(body, 900),
    hashtags,
    ctaText: input.cta ?? "프로필 링크에서 원문 아티클을 확인하세요",
    altText: `"${topic}" 트렌드를 요약한 카드뉴스 캐러셀 첫 슬라이드`,
  };
}

function buildThreads(input: CopywritingInput, topic: string, rng: () => number) {
  const coreMessage = input.coreMessage ?? `"${topic}" 관련해 관측되는 흐름을 짧게 정리합니다.`;
  const opener = input.hook ?? truncate(pick(rng, OPENERS)(topic), 60);
  const lines = [
    opener,
    truncate(coreMessage, 140),
    "근거와 추정은 구분해서 씁니다. 자세한 내용은 블로그에.",
  ];
  const body = truncate(lines.join("\n"), 480); // Threads 실제 글자수 한도(500자) 여유를 두고 생성
  return {
    title: undefined,
    body,
    hashtags: [],
    ctaText: input.cta ?? "블로그 원문 링크는 프로필에",
    altText: undefined,
  };
}

function buildBlogger(input: CopywritingInput, topic: string, rng: () => number) {
  const title = truncate(`${topic}: 중국 뷰티 플랫폼에서 읽는 마케팅 시사점`, 90);
  const tone = pick(rng, toneSentences(input.toneOfVoice));
  const coreMessage = input.coreMessage ?? `"${topic}" 관련 흐름을 데이터와 관찰을 구분해 정리합니다.`;

  const sections = [
    `## 들어가며`,
    `${pick(rng, OPENERS)(topic)} 이번 글에서는 "${topic}"와 관련해 샤오홍슈·도우인에서 관찰되는 신호를 정리하고, 한국 브랜드 마케터가 참고할 수 있는 실행 포인트를 제안합니다. ${tone}`,
    ``,
    `## 무엇이 관찰되었나`,
    `${coreMessage} 다만 아래 내용 중 일부는 정량 데이터로 완전히 검증되지 않은 추정이므로, 실제 캠페인에 적용하기 전 자체 데이터로 재확인하시길 권합니다.`,
    ``,
    `## 한국 브랜드 마케터를 위한 시사점`,
    `1. 콘텐츠 소재를 선정할 때 "${topic}"와 인접한 키워드의 반응을 관찰 지표로 참고할 수 있습니다.`,
    `2. 효과를 단정하는 표현보다, 확인된 사실과 관찰을 구분해 전달하는 편이 규제 리스크와 신뢰도 측면에서 유리합니다.`,
    `3. 채널별로 동일한 소재를 카드뉴스(인스타그램), 짧은 요약(쓰레드), 심화 분석(블로그)로 재구성하면 도달과 이해도를 함께 높일 수 있습니다.`,
    ``,
    `## 정리`,
    `"${topic}"는 아직 진행 중인 흐름이며, 인과관계를 단정하기보다 지속적으로 관찰이 필요한 주제입니다. ${input.targetPersona ? `${input.targetPersona}라면 ` : ""}다음 캠페인 소재를 검토할 때 참고 데이터 중 하나로 활용해보세요.`,
  ];

  const body = sections.join("\n");

  return {
    title,
    body,
    hashtags: [],
    ctaText: input.cta ?? "관련 브랜드 상담이 필요하다면 문의해 주세요",
    altText: `"${topic}" 아티클 대표 이미지`,
  };
}

export function runCopywritingAgent(input: CopywritingInput): AgentResult {
  const taskId = input.taskId ?? `copywriting-${input.channel}-${Date.now()}`;
  const topic = briefTopic(input.brief);
  const rng = seededRng(`copywriting:${input.channel}:${input.brief}:${input.toneOfVoice ?? ""}`);

  const built =
    input.channel === "INSTAGRAM"
      ? buildInstagram(input, topic, rng)
      : input.channel === "THREADS"
      ? buildThreads(input, topic, rng)
      : buildBlogger(input, topic, rng);

  // Never emit brand forbidden words — scrub title/body/hashtags/cta as a final safety pass.
  const scrubbedBody = scrubForbiddenWords(built.body, input.forbiddenWords);
  const scrubbedTitle = built.title ? scrubForbiddenWords(built.title, input.forbiddenWords) : undefined;
  const scrubbedCta = built.ctaText ? scrubForbiddenWords(built.ctaText, input.forbiddenWords) : undefined;
  const removedWords = [
    ...scrubbedBody.removed,
    ...(scrubbedTitle?.removed ?? []),
    ...(scrubbedCta?.removed ?? []),
  ];

  const artifact: CopyArtifact = {
    type: "channel_copy",
    channel: input.channel,
    title: scrubbedTitle ? scrubbedTitle.text : built.title,
    body: scrubbedBody.text,
    hashtags: built.hashtags,
    ctaText: scrubbedCta ? scrubbedCta.text : built.ctaText,
    altText: built.altText,
  };

  const assumptions = [
    `${CHANNEL_LABEL[input.channel]} 채널 길이/포맷 관행(짧고 강렬한 캡션+해시태그 / 초단문 / SEO 장문)을 기준으로 초안을 작성했습니다.`,
  ];
  const risks =
    removedWords.length > 0
      ? [
          {
            level: "medium" as const,
            description: `브랜드 금칙어(${[...new Set(removedWords)].join(", ")})가 초안에 포함되어 자동으로 제거했습니다. 문맥이 어색하지 않은지 검토가 필요합니다.`,
          },
        ]
      : [];

  return {
    taskId,
    agent: "COPYWRITING",
    status: "completed",
    summary: `${CHANNEL_LABEL[input.channel]} 채널용 원고 초안을 생성했습니다 (본문 ${artifact.body.length}자).`,
    artifacts: [artifact],
    sources: [],
    assumptions,
    risks,
    recommendations: [
      `${CHANNEL_LABEL[input.channel]} 발행 전 실제 브랜드 계정 톤에 맞게 사람이 최종 검토하는 것을 권장합니다.`,
    ],
    confidence: removedWords.length > 0 ? 0.7 : 0.82,
    nextAction: "품질검수 에이전트에게 전달하여 금칙어/출처/과장표현을 검사합니다.",
  };
}
