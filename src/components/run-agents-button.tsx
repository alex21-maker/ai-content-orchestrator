"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunAgentsButton({ contentItemId }: { contentItemId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/run-agents`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "에이전트 실행에 실패했습니다.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "에이전트 실행에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? "에이전트 실행 중..." : "에이전트 실행"}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
