import { describe, it, expect } from "vitest";
import { MockConnector } from "@/lib/connectors/mock-connector";
import type { PublishInput } from "@/lib/connectors/types";

function input(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    channel: "THREADS",
    body: "테스트 본문",
    hashtags: ["test"],
    idempotencyKey: "k1",
    ...overrides,
  };
}

describe("MockConnector", () => {
  it("is always in MOCK mode — never claims to be production", () => {
    expect(new MockConnector("INSTAGRAM").mode).toBe("MOCK");
  });

  it("rejects Instagram publish without an image (matches the real platform's requirement)", async () => {
    const connector = new MockConnector("INSTAGRAM");
    const { valid, errors } = await connector.validate(input({ channel: "INSTAGRAM" }));
    expect(valid).toBe(false);
    expect(errors.join(" ")).toMatch(/이미지/);
  });

  it("accepts Instagram publish with an image", async () => {
    const connector = new MockConnector("INSTAGRAM");
    const { valid } = await connector.validate(input({ channel: "INSTAGRAM", imageUrl: "https://example.com/x.png" }));
    expect(valid).toBe(true);
  });

  it("rejects empty body on every channel", async () => {
    for (const channel of ["INSTAGRAM", "THREADS", "BLOGGER"] as const) {
      const connector = new MockConnector(channel);
      const { valid, errors } = await connector.validate(
        input({ channel, body: "  ", imageUrl: "https://example.com/x.png" })
      );
      expect(valid, channel).toBe(false);
      expect(errors.length, channel).toBeGreaterThan(0);
    }
  });

  it("enforces Threads' short length limit", async () => {
    const connector = new MockConnector("THREADS");
    const { valid, errors } = await connector.validate(input({ body: "가".repeat(600) }));
    expect(valid).toBe(false);
    expect(errors.join(" ")).toMatch(/글자 수 제한/);
  });

  it("publish() fails closed when validate() fails — never publishes invalid content", async () => {
    const connector = new MockConnector("INSTAGRAM");
    const result = await connector.publish(input({ channel: "INSTAGRAM" })); // no imageUrl
    expect(result.succeeded).toBe(false);
    expect(result.externalPostId).toBeUndefined();
  });

  it("publish() succeeds on valid input and returns a mock:// style id, never a bare real-looking URL", async () => {
    const connector = new MockConnector("THREADS");
    const result = await connector.publish(input());
    expect(result.succeeded).toBe(true);
    expect(result.externalPostId).toMatch(/^mock_/);
    expect(result.externalUrl).toContain("mock.local");
  });

  it("fetchMetrics() always flags isEstimated true (never pretends to be real channel data)", async () => {
    const connector = new MockConnector("BLOGGER");
    const metrics = await connector.fetchMetrics("mock_blogger_abc123");
    expect(metrics.isEstimated).toBe(true);
  });

  it("fetchMetrics() is deterministic for the same post id", async () => {
    const connector = new MockConnector("THREADS");
    const a = await connector.fetchMetrics("mock_threads_same_id");
    const b = await connector.fetchMetrics("mock_threads_same_id");
    expect(a).toEqual(b);
  });
});
