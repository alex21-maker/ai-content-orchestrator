import type {
  ChannelName,
  Connector,
  ConnectorCapability,
  MetricsResult,
  PublishInput,
  PublishResult,
} from "./types";
import { CAPABILITY_MATRIX } from "./types";

const CHANNEL_LIMITS: Record<ChannelName, { maxBody: number; maxHashtags: number }> = {
  INSTAGRAM: { maxBody: 2200, maxHashtags: 30 },
  THREADS: { maxBody: 500, maxHashtags: 10 },
  BLOGGER: { maxBody: 40000, maxHashtags: 20 },
};

/**
 * Simulates a full publish round-trip without ever making a network call to
 * a real social platform. Used for the entire Phase 1 approve → publish →
 * audit flow. UI must always show a "MOCK — 실제 게시 아님" badge when this
 * connector is in play (mode === "MOCK"), per docs/PRD.md section 9's
 * requirement that mock success never look like real publish success.
 */
export class MockConnector implements Connector {
  readonly mode = "MOCK" as const;

  constructor(readonly channel: ChannelName) {}

  capability(): ConnectorCapability {
    return CAPABILITY_MATRIX[this.channel];
  }

  async validate(input: PublishInput): Promise<{ valid: boolean; errors: string[] }> {
    const limits = CHANNEL_LIMITS[this.channel];
    const errors: string[] = [];
    if (!input.body || input.body.trim().length === 0) {
      errors.push("본문이 비어 있습니다.");
    }
    if (input.body.length > limits.maxBody) {
      errors.push(`본문이 ${this.channel} 글자 수 제한(${limits.maxBody}자)을 초과했습니다.`);
    }
    if (input.hashtags.length > limits.maxHashtags) {
      errors.push(`해시태그가 ${this.channel} 개수 제한(${limits.maxHashtags}개)을 초과했습니다.`);
    }
    if (this.channel === "INSTAGRAM" && !input.imageUrl) {
      errors.push("인스타그램은 이미지가 필요합니다.");
    }
    return { valid: errors.length === 0, errors };
  }

  async preview(input: PublishInput): Promise<{ html: string }> {
    const hashtags = input.hashtags.map((h) => `#${h}`).join(" ");
    return {
      html: `<div class="mock-preview mock-preview--${this.channel.toLowerCase()}">
        ${input.title ? `<h3>${escapeHtml(input.title)}</h3>` : ""}
        ${input.imageUrl ? `<img src="${escapeHtml(input.imageUrl)}" alt="" />` : ""}
        <p>${escapeHtml(input.body).replace(/\n/g, "<br/>")}</p>
        <p class="hashtags">${escapeHtml(hashtags)}</p>
      </div>`,
    };
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const { valid, errors } = await this.validate(input);
    if (!valid) {
      return {
        succeeded: false,
        error: errors.join(" "),
        requestSummary: { channel: this.channel, idempotencyKey: input.idempotencyKey },
        responseSummary: { errors },
      };
    }

    // Deterministic mock: never fails on valid input, so the demo flow is
    // reliable. A separate "simulate failure" dev-only path (query param)
    // exists in the API route for testing the retry UI.
    const externalPostId = `mock_${this.channel.toLowerCase()}_${input.idempotencyKey.slice(0, 12)}`;
    return {
      succeeded: true,
      externalPostId,
      externalUrl: `https://mock.local/${this.channel.toLowerCase()}/${externalPostId}`,
      requestSummary: {
        channel: this.channel,
        bodyLength: input.body.length,
        hashtagCount: input.hashtags.length,
        idempotencyKey: input.idempotencyKey,
      },
      responseSummary: { externalPostId, mode: "MOCK" },
    };
  }

  async fetchMetrics(externalPostId: string): Promise<MetricsResult> {
    // Deterministic pseudo-random metrics seeded from the post id so repeated
    // calls in a demo are stable rather than jumping around randomly.
    const seed = hashString(externalPostId);
    const base = 200 + (seed % 800);
    return {
      impressions: base * 6,
      reach: base * 4,
      views: this.channel !== "BLOGGER" ? base * 5 : undefined,
      likes: Math.round(base * 0.12),
      comments: Math.round(base * 0.02),
      saves: Math.round(base * 0.03),
      shares: Math.round(base * 0.015),
      clicks: this.channel === "BLOGGER" ? Math.round(base * 0.3) : undefined,
      conversions: undefined,
      isEstimated: true,
    };
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getConnector(channel: ChannelName): Connector {
  // Phase 1: always mock, regardless of CONNECTOR_MODE env — real connectors
  // don't exist yet. This function is the single seam Phase 2 changes.
  return new MockConnector(channel);
}
