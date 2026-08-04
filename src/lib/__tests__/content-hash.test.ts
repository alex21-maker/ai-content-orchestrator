import { describe, it, expect } from "vitest";
import { computeContentHash, type HashableVariant } from "@/lib/content-hash";

const base: HashableVariant[] = [
  { channel: "INSTAGRAM", title: "제목", body: "본문 내용", hashtags: ["a", "b"], ctaText: "CTA", altText: "설명" },
  { channel: "THREADS", title: null, body: "쓰레드 본문", hashtags: ["c"], ctaText: null, altText: null },
];

describe("computeContentHash", () => {
  it("is deterministic for the same input", () => {
    expect(computeContentHash(base)).toBe(computeContentHash(base));
  });

  it("is independent of input array order (the approve/publish routes don't ORDER BY)", () => {
    const reversed = [...base].reverse();
    expect(computeContentHash(base)).toBe(computeContentHash(reversed));
  });

  it("is independent of hashtag order within a variant", () => {
    const shuffled: HashableVariant[] = [
      { ...base[0], hashtags: ["b", "a"] },
      base[1],
    ];
    expect(computeContentHash(base)).toBe(computeContentHash(shuffled));
  });

  it("changes when body text changes — this is the approval-invalidation trigger", () => {
    const edited: HashableVariant[] = [{ ...base[0], body: "수정된 본문" }, base[1]];
    expect(computeContentHash(base)).not.toBe(computeContentHash(edited));
  });

  it("changes when a hashtag is added or removed", () => {
    const edited: HashableVariant[] = [{ ...base[0], hashtags: ["a", "b", "c"] }, base[1]];
    expect(computeContentHash(base)).not.toBe(computeContentHash(edited));
  });

  it("treats null and empty-string fields the same way consistently", () => {
    const a: HashableVariant[] = [{ channel: "BLOGGER", title: null, body: "x", hashtags: [], ctaText: null, altText: null }];
    const b: HashableVariant[] = [{ channel: "BLOGGER", title: "", body: "x", hashtags: [], ctaText: "", altText: "" }];
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });
});
