// Real LLM-based bilingual (ko/zh) meeting analysis via the Claude API.
// Unlike a rule-based extractor, this produces genuine meaning-level
// summaries and translation, not just verbatim excerpts.
//
// Speaker separation is also LLM-inferred from the plain transcript text
// (turn-taking cues, self-references, participant names as hints) — Whisper
// does not do audio-based diarization, so this is best-effort and can be
// wrong, especially with more than a couple of speakers.

import Anthropic from "@anthropic-ai/sdk";

export interface MeetingAnalysis {
  title: string;
  summaryKo: string;
  summaryZh: string;
  decisions: string[];
  actionItems: { text: string; owner: string | null }[];
  risks: string[];
  speakerSegments: { speaker: string; text: string }[];
}

const SYSTEM_PROMPT = `당신은 한국어와 중국어가 섞여 진행되는 회의의 녹취록을 분석하는 어시스턴트입니다.
사용자는 회의 제목을 따로 입력하지 않습니다 — 녹취록 내용을 보고 제목도 당신이 직접 판단해서 짓습니다.
주어진 녹취록(음성인식 결과라 오탈자가 있을 수 있음)을 읽고 아래 JSON 스키마에 정확히 맞는 JSON 객체 "하나만" 출력하세요.
설명, 마크다운 코드펜스, 그 밖의 텍스트는 절대 포함하지 마세요.

참고로 녹취록에는 화자 구분이 없는 하나의 텍스트만 주어집니다(음성 자체를 분석하는 것이 아니라
텍스트만 보고 판단). 문맥(말투 전환, 질문-답변, 자기소개, 호칭 등)을 근거로 화자가 바뀌는 지점을
최대한 추정해서 나누되, 확신이 없으면 화자 수를 무리하게 늘리지 말고 "화자1", "화자2"처럼 표시해도
됩니다. 회의 참가자 이름이 주어지면 문맥상 각 발화가 누구의 것인지 최대한 그 이름으로 매칭하세요.

스키마:
{
  "title": string,       // 회의 내용을 바탕으로 지은 한국어 제목 (10-25자 내외, 핵심 주제가 드러나게)
  "summaryKo": string,   // 회의 전체를 한국어로 요약 (3-6문장)
  "summaryZh": string,   // 회의 전체를 중국어로 요약 (3-6句)
  "decisions": string[], // 회의에서 확정된 결정 사항 (없으면 빈 배열)
  "actionItems": [{ "text": string, "owner": string | null }], // 액션 아이템과 담당자(불명확하면 null)
  "risks": string[],     // 언급된 리스크/우려 사항 (없으면 빈 배열)
  "speakerSegments": [{ "speaker": string, "text": string }] // 추정한 화자별 발화 순서대로 나열
}`;

export async function analyzeMeetingTranscript(
  transcript: string,
  participants: string[] = []
): Promise<MeetingAnalysis> {
  const client = new Anthropic();

  const participantsNote =
    participants.length > 0
      ? `\n\n회의 참가자 (화자 매칭에 참고하세요): ${participants.join(", ")}`
      : "";

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${transcript}${participantsNote}` }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Claude 응답에서 텍스트 블록을 찾지 못했습니다.");
  }

  const raw = textBlock.text.trim();
  const jsonText = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "")
    : raw;

  let parsed: MeetingAnalysis;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude 응답을 JSON으로 파싱하지 못했습니다: ${jsonText.slice(0, 200)}`);
  }

  return {
    title: parsed.title ?? "제목 없는 회의",
    summaryKo: parsed.summaryKo ?? "",
    summaryZh: parsed.summaryZh ?? "",
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    speakerSegments: Array.isArray(parsed.speakerSegments) ? parsed.speakerSegments : [],
  };
}
