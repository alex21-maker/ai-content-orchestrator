// Content hashing for the approve → publish integrity check (docs/PRD.md
// section 6 & 8): an Approval stores the hash of every ChannelVariant body
// at approval time; PublicationJob creation re-hashes and rejects on
// mismatch, and any edit after APPROVED must invalidate the approval.

import { createHash } from "node:crypto";

export interface HashableVariant {
  channel: string;
  title: string | null;
  body: string;
  hashtags: string[];
  ctaText: string | null;
  altText: string | null;
}

export function computeContentHash(variants: HashableVariant[]): string {
  const normalized = [...variants]
    .sort((a, b) => a.channel.localeCompare(b.channel))
    .map((v) => ({
      channel: v.channel,
      title: v.title ?? "",
      body: v.body,
      hashtags: [...v.hashtags].sort(),
      ctaText: v.ctaText ?? "",
      altText: v.altText ?? "",
    }));
  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex");
}
