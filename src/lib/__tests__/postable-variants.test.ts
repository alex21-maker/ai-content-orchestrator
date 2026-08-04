import { describe, it, expect } from "vitest";
import { isPostableVariant, selectPostableVariants } from "@/lib/postable-variants";

// Regression test for a real integration bug: the mock orchestrator writes
// TWO channelVariant rows per channel (one from copywriting = the actual
// post copy, one from creative = a text-only production brief). Before this
// filter existed, the publish route looped over both rows and tried to
// insert two publicationJobs with the same idempotencyKey
// (contentItemId:channel:approvalId doesn't include a variant id), crashing
// with a Postgres unique-constraint violation on every publish attempt for
// content produced by the real orchestrator. Caught via a live smoke test,
// not by any agent's own isolated testing — this test locks the fix in.
describe("selectPostableVariants", () => {
  const rows = [
    { channel: "INSTAGRAM", createdBy: "agent:copywriting" },
    { channel: "INSTAGRAM", createdBy: "agent:creative" },
    { channel: "THREADS", createdBy: "agent:copywriting" },
    { channel: "THREADS", createdBy: "agent:creative" },
    { channel: "BLOGGER", createdBy: "agent:copywriting" },
    { channel: "BLOGGER", createdBy: "agent:creative" },
  ];

  it("filters out every agent:creative row", () => {
    const result = selectPostableVariants(rows);
    expect(result.every((v) => v.createdBy !== "agent:creative")).toBe(true);
  });

  it("leaves exactly one row per channel — the invariant idempotencyKey generation depends on", () => {
    const result = selectPostableVariants(rows);
    const channels = result.map((v) => v.channel);
    expect(new Set(channels).size).toBe(channels.length);
    expect(result).toHaveLength(3);
  });

  it("keeps a user-edited row (createdBy stays as the original agent tag after edits, per the variant-edit route)", () => {
    expect(isPostableVariant({ channel: "INSTAGRAM", createdBy: "agent:copywriting" })).toBe(true);
  });

  it("still rejects any future creative-subtype naming like agent:creative-v2", () => {
    expect(isPostableVariant({ channel: "INSTAGRAM", createdBy: "agent:creative-v2" })).toBe(false);
  });
});
