"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Decision = "approved" | "rejected" | "revision_requested";

const LABELS: Record<Decision, string> = {
  approved: "승인",
  rejected: "반려",
  revision_requested: "수정 요청",
};

const STYLES: Record<Decision, string> = {
  approved: "bg-[var(--accent)] text-white hover:opacity-90",
  rejected: "border border-red-300 text-red-700 hover:bg-red-50",
  revision_requested: "border border-amber-300 text-amber-800 hover:bg-amber-50",
};

export function ApprovalDecisionButtons({ contentItemId }: { contentItemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: Decision) {
    let note: string | null = null;
    if (decision !== "approved") {
      note = window.prompt(decision === "rejected" ? "반려 사유를 입력하세요 (선택)" : "수정 요청 사항을 입력하세요 (선택)") ?? "";
    }
    setPending(decision);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "처리에 실패했습니다.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리에 실패했습니다.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {(Object.keys(LABELS) as Decision[]).map((decision) => (
          <button
            key={decision}
            type="button"
            disabled={pending !== null}
            onClick={() => submit(decision)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${STYLES[decision]}`}
          >
            {pending === decision ? "처리 중..." : LABELS[decision]}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
