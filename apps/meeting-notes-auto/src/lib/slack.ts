import type { MeetingAnalysis } from "./analysis";

export interface SlackDeliveryResult {
  mode: "MOCK" | "PRODUCTION";
  succeeded: boolean;
  errorMessage?: string;
}

function bulletList(items: string[], emptyLabel: string): string {
  if (items.length === 0) return `_${emptyLabel}_`;
  return items.map((item) => `• ${item}`).join("\n");
}

export function buildSlackMessage(input: {
  driveLink: string;
  transcript: string;
  analysis: MeetingAnalysis;
}): { text: string; blocks: Record<string, unknown>[] } {
  const { driveLink, analysis } = input;

  const actionItemLines =
    analysis.actionItems.length === 0
      ? "_없음_"
      : analysis.actionItems.map((a) => `• ${a.owner ? `*${a.owner}*: ` : ""}${a.text}`).join("\n");

  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: "📋 회의 자동 분석 완료", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*🇰🇷 한국어 요약*\n${analysis.summaryKo || "-"}` } },
    { type: "section", text: { type: "mrkdwn", text: `*🇨🇳 中文摘要*\n${analysis.summaryZh || "-"}` } },
    { type: "section", text: { type: "mrkdwn", text: `*✅ 결정 사항*\n${bulletList(analysis.decisions, "없음")}` } },
    { type: "section", text: { type: "mrkdwn", text: `*🔧 액션 아이템*\n${actionItemLines}` } },
    { type: "section", text: { type: "mrkdwn", text: `*⚠️ 리스크*\n${bulletList(analysis.risks, "없음")}` } },
    { type: "divider" },
    { type: "context", elements: [{ type: "mrkdwn", text: `🎙️ <${driveLink}|원본 녹음 파일 (Google Drive)>` }] },
  ];

  const text = `📋 회의 자동 분석 완료 — ${analysis.summaryKo.slice(0, 200)}`;

  return { text, blocks };
}

export async function sendToSlack(input: {
  driveLink: string;
  transcript: string;
  analysis: MeetingAnalysis;
}): Promise<SlackDeliveryResult> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const { text, blocks } = buildSlackMessage(input);

  if (!webhookUrl) {
    return { mode: "MOCK", succeeded: true };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { mode: "PRODUCTION", succeeded: false, errorMessage: body || `HTTP ${res.status}` };
    }
    return { mode: "PRODUCTION", succeeded: true };
  } catch (err) {
    return {
      mode: "PRODUCTION",
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Slack 전송 중 알 수 없는 오류",
    };
  }
}
