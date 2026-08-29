// Slack delivery for meeting summaries — via a Slack Incoming Webhook.
//
// Unlike the Instagram/Threads/Blogger connectors (src/lib/connectors/*),
// which have no real Phase 1 implementation at all, a Slack incoming webhook
// needs no OAuth flow — just a URL — so this is a REAL integration whenever
// SLACK_WEBHOOK_URL is configured. When it isn't (e.g. local dev without a
// workspace set up yet), delivery is simulated (mode "MOCK") so the rest of
// the flow (analyze → review → "send to Slack" → delivery history) can still
// be exercised end to end without a real workspace.

import type { MeetingSummaryArtifact, MeetingStatement } from "@/lib/agents/meeting-analysis";

export interface SlackDeliveryResult {
  mode: "MOCK" | "PRODUCTION";
  succeeded: boolean;
  responseSummary: Record<string, unknown>;
  errorMessage?: string;
}

function bulletLines(statements: MeetingStatement[], emptyLabel: string): string {
  if (statements.length === 0) return `_${emptyLabel}_`;
  return statements
    .map((s) => `• ${s.speaker ? `*${s.speaker}*: ` : ""}${s.text}`)
    .join("\n")
    .slice(0, 2900); // stay under Slack's 3000-char section text limit
}

export function buildSlackMessage(input: {
  title: string;
  occurredAt: Date;
  participants: string[];
  summary: MeetingSummaryArtifact;
}): { text: string; blocks: Record<string, unknown>[] } {
  const { title, occurredAt, participants, summary } = input;
  const dateLabel = occurredAt.toISOString().slice(0, 10);
  const participantsLabel = participants.length > 0 ? participants.join(", ") : "—";

  const actionItemLines =
    summary.actionItems.length === 0
      ? "_없음_"
      : summary.actionItems
          .map((a) => `• ${a.ownerGuess ? `*${a.ownerGuess}*: ` : ""}${a.text}`)
          .join("\n")
          .slice(0, 2900);

  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: `📋 ${title}`, emoji: true } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `🗓️ ${dateLabel}  ·  👥 ${participantsLabel}` }],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*🇰🇷 한국어 핵심 발언*\n${bulletLines(summary.keyStatementsKo, "한국어 발언 없음")}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*🇨🇳 中文关键发言*\n${bulletLines(summary.keyStatementsZh, "无中文发言")}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*✅ 결정 사항*\n${bulletLines(summary.decisions, "결정 사항 없음")}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*🔧 액션 아이템*\n${actionItemLines}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*⚠️ 리스크*\n${bulletLines(summary.meetingRisks, "리스크 없음")}` },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "규칙 기반 추출 요약(Phase 1) · 실제 배포/공유 전 사람이 검토하세요.",
        },
      ],
    },
  ];

  const text = [
    `📋 ${title} (${dateLabel})`,
    `한국어 핵심 발언 ${summary.keyStatementsKo.length}건, 中文关键发言 ${summary.keyStatementsZh.length}건`,
    `결정 ${summary.decisions.length}건, 액션 아이템 ${summary.actionItems.length}건, 리스크 ${summary.meetingRisks.length}건`,
  ].join(" · ");

  return { text, blocks };
}

/** Sends a meeting summary to Slack via SLACK_WEBHOOK_URL, or simulates it if unset. */
export async function sendMeetingSummaryToSlack(input: {
  title: string;
  occurredAt: Date;
  participants: string[];
  summary: MeetingSummaryArtifact;
}): Promise<SlackDeliveryResult> {
  const { text, blocks } = buildSlackMessage(input);
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      mode: "MOCK",
      succeeded: true,
      responseSummary: {
        simulated: true,
        blockCount: blocks.length,
        note: "SLACK_WEBHOOK_URL이 설정되지 않아 실제로 전송되지 않았습니다 (Phase 1 mock).",
      },
    };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });
    const bodyText = await res.text();

    if (!res.ok) {
      return {
        mode: "PRODUCTION",
        succeeded: false,
        responseSummary: { status: res.status },
        errorMessage: bodyText || `Slack webhook이 ${res.status} 상태를 반환했습니다.`,
      };
    }

    return { mode: "PRODUCTION", succeeded: true, responseSummary: { status: res.status, body: bodyText } };
  } catch (err) {
    return {
      mode: "PRODUCTION",
      succeeded: false,
      responseSummary: {},
      errorMessage: err instanceof Error ? err.message : "Slack 전송 중 알 수 없는 오류가 발생했습니다.",
    };
  }
}
