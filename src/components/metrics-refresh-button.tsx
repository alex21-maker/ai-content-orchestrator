"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MetricsRefreshButton({ contentItemId }: { contentItemId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/metrics/refresh`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "지표 갱신에 실패했습니다.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "지표 갱신에 실패했습니다.");
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
        className="rounded-md border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        {loading ? "갱신 중..." : "새로고침"}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
