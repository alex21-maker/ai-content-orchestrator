// MEETING_ANALYSIS agent — bilingual (ko/zh) meeting transcript analysis.
//
// Unlike the other Phase 1 agents (research/strategy/copywriting/creative),
// which generate net-new marketing content and are explicitly labeled as
// plausible mocks, this agent operates on a transcript the user actually
// provided. Inventing a "summary" of a real meeting would misrepresent what
// was said — so this does NOT call an LLM (none is configured in Phase 1)
// and does NOT fabricate a narrative summary. Instead it runs honest,
// deterministic extraction: per-line language detection (Hangul vs Han
// script) and keyword-based surfacing of decisions/action items/risks,
// always as verbatim excerpts of the transcript.
//
// Phase 2 TODO: swap the keyword heuristics below for a real LLM call
// (e.g. Claude API) to get true bilingual summarization/translation instead
// of extraction — the AgentResult shape this returns is designed so callers
// don't need to change when that happens.

import type { AgentResult } from "@/lib/agent-protocol";

export type StatementLanguage = "ko" | "zh" | "mixed" | "other";

export interface MeetingStatement {
  text: string;
  language: StatementLanguage;
  speaker: string | null;
}

export interface MeetingActionItem extends MeetingStatement {
  ownerGuess: string | null;
}

export interface MeetingSummaryArtifact {
  type: "meeting_summary";
  languageBreakdown: Record<StatementLanguage, number>;
  keyStatementsKo: MeetingStatement[];
  keyStatementsZh: MeetingStatement[];
  decisions: MeetingStatement[];
  actionItems: MeetingActionItem[];
  meetingRisks: MeetingStatement[];
  statementCount: number;
}

export interface MeetingAnalysisInput {
  title: string;
  transcriptText: string;
  taskId?: string;
}

const DECISION_KEYWORDS = [
  "결정", "확정", "합의", "정하겠습니다", "정했습니다", "채택",
  "决定", "确定", "达成一致", "敲定", "拍板",
];
const ACTION_KEYWORDS = [
  "해야", "하겠습니다", "부탁", "요청", "액션", "담당", "진행하겠", "맡아",
  "需要", "负责", "跟进", "落实", "麻烦", "行动项", "安排",
];
const RISK_KEYWORDS = [
  "리스크", "문제", "우려", "지연", "블로커", "이슈",
  "风险", "问题", "延迟", "担心", "阻碍", "隐患",
];

const HANGUL_RE = /[가-힣]/g;
const HAN_RE = /[一-鿿]/g;
const SPEAKER_LINE_RE = /^\s*(?:\[([^\]]{1,40})\]|([^:：\n]{1,40}))\s*[:：]\s*(.+)$/;
const SENTENCE_SPLIT_RE = /[^.!?。！？]+[.!?。！？]*/g;

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export function detectLanguage(text: string): StatementLanguage {
  const hangul = countMatches(text, HANGUL_RE);
  const han = countMatches(text, HAN_RE);
  if (hangul === 0 && han === 0) return "other";
  if (hangul > 0 && han > 0) return "mixed";
  return hangul > han ? "ko" : "zh";
}

interface Turn {
  speaker: string | null;
  text: string;
}

function parseTurns(transcriptText: string): Turn[] {
  return transcriptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(SPEAKER_LINE_RE);
      if (!match) return { speaker: null, text: line };
      const speaker = (match[1] ?? match[2])?.trim() || null;
      return { speaker, text: match[3].trim() };
    });
}

function splitSentences(text: string): string[] {
  const matches = text.match(SENTENCE_SPLIT_RE);
  const sentences = (matches ?? [text]).map((s) => s.trim()).filter((s) => s.length >= 2);
  return sentences.length > 0 ? sentences : [text.trim()].filter((s) => s.length > 0);
}

function toStatements(turns: Turn[]): MeetingStatement[] {
  const statements: MeetingStatement[] = [];
  for (const turn of turns) {
    for (const sentence of splitSentences(turn.text)) {
      statements.push({ text: sentence, language: detectLanguage(sentence), speaker: turn.speaker });
    }
  }
  return statements;
}

/** Ranks a statement for "key statement" surfacing — higher = more worth surfacing. */
function scoreStatement(s: MeetingStatement): number {
  let score = 0;
  if (containsAny(s.text, DECISION_KEYWORDS)) score += 2;
  if (containsAny(s.text, ACTION_KEYWORDS)) score += 2;
  if (containsAny(s.text, RISK_KEYWORDS)) score += 1;
  if (/\d/.test(s.text)) score += 1;
  score += Math.min(s.text.length, 80) / 80;
  return score;
}

/** Picks the top-N statements by score, then restores transcript order (readable as excerpts). */
function topByScore(statements: MeetingStatement[], n: number): MeetingStatement[] {
  const indexed = statements.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => scoreStatement(b.s) - scoreStatement(a.s));
  const top = indexed.slice(0, n);
  top.sort((a, b) => a.i - b.i);
  return top.map((t) => t.s);
}

const MAX_KEY_STATEMENTS = 5;
const MAX_EXTRACTED_PER_CATEGORY = 10;

export function runMeetingAnalysisAgent(input: MeetingAnalysisInput): AgentResult {
  const taskId = input.taskId ?? `meeting-analysis-${Date.now()}`;
  const turns = parseTurns(input.transcriptText);
  const statements = toStatements(turns);

  const languageBreakdown: Record<StatementLanguage, number> = { ko: 0, zh: 0, mixed: 0, other: 0 };
  for (const s of statements) languageBreakdown[s.language]++;

  const koCandidates = statements.filter((s) => s.language === "ko" || s.language === "mixed");
  const zhCandidates = statements.filter((s) => s.language === "zh" || s.language === "mixed");

  const decisions = statements.filter((s) => containsAny(s.text, DECISION_KEYWORDS)).slice(0, MAX_EXTRACTED_PER_CATEGORY);
  const actionItems: MeetingActionItem[] = statements
    .filter((s) => containsAny(s.text, ACTION_KEYWORDS))
    .slice(0, MAX_EXTRACTED_PER_CATEGORY)
    .map((s) => ({ ...s, ownerGuess: s.speaker }));
  const meetingRisks = statements.filter((s) => containsAny(s.text, RISK_KEYWORDS)).slice(0, MAX_EXTRACTED_PER_CATEGORY);

  const artifact: MeetingSummaryArtifact = {
    type: "meeting_summary",
    languageBreakdown,
    keyStatementsKo: topByScore(koCandidates, MAX_KEY_STATEMENTS),
    keyStatementsZh: topByScore(zhCandidates, MAX_KEY_STATEMENTS),
    decisions,
    actionItems,
    meetingRisks,
    statementCount: statements.length,
  };

  const classifiedCount = languageBreakdown.ko + languageBreakdown.zh + languageBreakdown.mixed;
  const coverage = statements.length > 0 ? classifiedCount / statements.length : 0;

  const assumptions = [
    "Phase 1은 규칙 기반(키워드/문자 스크립트 감지) 추출 요약이며 실제 LLM 기반 의미 요약·번역이 아닙니다 — 아래 항목은 모두 원문 발췌입니다.",
    "화자 표기('이름: 발언' 형식)가 없는 문장은 담당자를 추정할 수 없어 액션 아이템의 ownerGuess가 비어 있을 수 있습니다.",
  ];

  const risks: AgentResult["risks"] = [];
  if (statements.length > 0 && coverage < 0.7) {
    risks.push({
      level: "medium",
      description: `전체 ${statements.length}개 발언 중 ${languageBreakdown.other}개가 한국어/중국어로 식별되지 않았습니다. 화자 표기 형식이나 문장 부호를 확인하세요.`,
    });
  }
  if (statements.length === 0) {
    risks.push({ level: "high", description: "회의록 텍스트에서 분석 가능한 문장을 찾지 못했습니다." });
  }
  if (decisions.length === 0 && actionItems.length === 0 && statements.length > 0) {
    risks.push({
      level: "low",
      description: "결정 사항/액션 아이템으로 분류된 발언이 없습니다 — 실제로 없었거나 키워드 매칭 범위를 벗어났을 수 있습니다.",
    });
  }

  const status: AgentResult["status"] = statements.length === 0 ? "blocked" : "completed";

  return {
    taskId,
    agent: "MEETING_ANALYSIS",
    status,
    summary:
      statements.length === 0
        ? `"${input.title}" 회의록에서 분석할 문장을 찾지 못했습니다. 회의록 텍스트를 확인하세요.`
        : `"${input.title}" 회의 발화 ${statements.length}건을 분석했습니다 (한국어 ${languageBreakdown.ko}건 · 중국어 ${languageBreakdown.zh}건 · 병행 ${languageBreakdown.mixed}건 · 미분류 ${languageBreakdown.other}건). 결정 ${decisions.length}건, 액션 아이템 ${actionItems.length}건, 리스크 ${meetingRisks.length}건을 추출했습니다.`,
    artifacts: [artifact],
    sources: [],
    assumptions,
    risks,
    recommendations: [
      "Slack으로 전달하거나 공유하기 전에 사람이 회의록 원문과 대조하여 추출 결과를 검증하세요.",
      "Phase 2에서 Claude API 등 실제 LLM 연동으로 교체하면 진짜 의미 요약과 한↔중 번역이 가능합니다.",
    ],
    confidence: Number(coverage.toFixed(2)),
    nextAction: "분석 결과를 회의 상세 화면에서 검토한 뒤 Slack으로 전달합니다.",
  };
}
