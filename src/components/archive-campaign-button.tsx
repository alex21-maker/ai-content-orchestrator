"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ArchiveCampaignButton({ campaignId, archived }: { campaignId: string; archived: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archived ? "active" : "archived" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "상태 변경에 실패했습니다.");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={submitting}
      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--sub)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
    >
      {archived ? "캠페인 복원" : "캠페인 보관"}
    </button>
  );
}
