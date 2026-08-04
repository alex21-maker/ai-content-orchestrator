// The mock orchestrator (src/lib/agents/orchestrator.ts) writes TWO
// ChannelVariant rows per channel: one from the copywriting agent (the
// actual post text — title/body/hashtags/CTA) and one from the creative
// agent (a text-only production brief — concept/shot list, not publishable
// copy). Approval hashing and publishing must only ever consider the
// copywriting row as "the content" for that channel; the creative row is
// reference material, not something that gets posted.
//
// This filter is the single place that distinction lives, so approve/publish/
// variant-edit routes (built by different people/agents) don't each redefine
// it slightly differently and drift apart.

export interface VariantLike {
  channel: string;
  createdBy: string;
}

/** True if this row is the channel's actual postable copy (not a creative brief). */
export function isPostableVariant(v: VariantLike): boolean {
  return !v.createdBy.startsWith("agent:creative");
}

/** Filters a full channelVariants list down to one postable row per channel. */
export function selectPostableVariants<T extends VariantLike>(variants: T[]): T[] {
  return variants.filter(isPostableVariant);
}
