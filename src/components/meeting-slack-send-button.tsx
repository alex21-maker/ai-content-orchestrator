"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MeetingSlackSendButton({ meetingId, disabled }: { meetingId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<"succeeded" | "mock" | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/slack`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "Slack 전송에 실패했습니다.");
      }
      setLastResult(json?.delivery?.mode === "MOCK" ? "mock" : "succeeded");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slack 전송에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className="rounded-md border border-[var(--line)] px-4 py-1.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        {loading ? "전송 중..." : "Slack으로 전송"}
      </button>
      {lastResult === "succeeded" && <p className="text-[11px] text-emerald-700">Slack으로 전송했습니다.</p>}
      {lastResult === "mock" && (
        <p className="text-[11px] text-amber-700">
          SLACK_WEBHOOK_URL이 설정되지 않아 시뮬레이션(MOCK)으로 처리했습니다 — 실제 전송 아님.
        </p>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
