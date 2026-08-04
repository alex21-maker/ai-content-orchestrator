// Shared helpers for the mock agents in src/lib/agents/*.
// Deterministic (seeded) pseudo-randomness so the same content item always
// gets the same generated copy on repeated runs, but different content items
// / campaigns produce varied, non-lorem-ipsum output.

import type { AgentResult } from "@/lib/agent-protocol";

export type Channel = "INSTAGRAM" | "THREADS" | "BLOGGER";

/** Simple deterministic string hash (djb2 variant). */
export function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — deterministic, seeded from a string. */
export function seededRng(seed: string): () => number {
  let a = hashString(seed) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Pick `n` distinct elements (order preserved from a shuffled copy). */
export function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Ensures `text` contains none of `forbiddenWords` (brand-level 금칙어).
 * Any match is stripped and replaced with a neutral placeholder, and the
 * substitution is reported so callers can surface it as an assumption.
 */
export function scrubForbiddenWords(
  text: string,
  forbiddenWords: string[] | undefined
): { text: string; removed: string[] } {
  if (!forbiddenWords || forbiddenWords.length === 0) return { text, removed: [] };
  let result = text;
  const removed: string[] = [];
  for (const word of forbiddenWords) {
    if (!word) continue;
    if (result.includes(word)) {
      removed.push(word);
      result = result.split(word).join("").replace(/\s{2,}/g, " ").trim();
    }
  }
  return { text: result, removed };
}

/**
 * Extracts a short, human-readable "topic" snippet from a free-text brief.
 * Prefers a quoted keyword phrase if the brief author already called one out
 * (e.g. 브리프 안의 '저자극 선크림'), since that reads far more naturally in
 * generated copy than a mid-sentence truncation of the whole brief.
 */
export function briefTopic(brief: string, max = 36): string {
  const cleaned = brief.replace(/\s+/g, " ").trim();
  const quoted = cleaned.match(/['"“「『]([^'"”」』]{2,30})['"”」』]/);
  if (quoted?.[1]) return truncate(quoted[1].trim(), max);
  return truncate(cleaned, max);
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  INSTAGRAM: "인스타그램",
  THREADS: "쓰레드",
  BLOGGER: "블로그(Blogger)",
};

/** Generic filler phrases that read as lazy/generic copywriting when reused verbatim across channels. */
export const GENERIC_FILLER_PHRASES = [
  "많은 분들이 궁금해하시는",
  "지금 바로 확인해보세요",
  "여러분 안녕하세요",
  "요즘 핫한 이슈",
  "놓치면 후회하는",
];

/** Regulatory-sensitive overclaim patterns common in KR beauty/derma marketing. */
export const OVERCLAIM_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /100\s*%\s*(효과|보장|만족)/, label: "100% 효과/보장 단정 표현" },
  { pattern: /부작용\s*(이\s*)?없/, label: "부작용 없음 단정 표현" },
  { pattern: /완치|즉효|즉시\s*효과/, label: "즉각적 치료/효과 단정 표현" },
  { pattern: /최고의|최상의|유일한/, label: "근거 없는 최상급 표현" },
];

/** Rough heuristic for "this sentence makes a factual/statistical claim". */
export const FACTUAL_CLAIM_PATTERN = /\d+(\.\d+)?\s*(%|퍼센트|배|위|만\s*명|억\s*원|만\s*건)/;

export function nowIso(): string {
  return new Date().toISOString();
}

/** Builds the boilerplate id/agent fields of an AgentResult; callers fill the rest. */
export function baseResult(
  taskId: string,
  agent: string
): Pick<AgentResult, "taskId" | "agent"> {
  return { taskId, agent };
}
