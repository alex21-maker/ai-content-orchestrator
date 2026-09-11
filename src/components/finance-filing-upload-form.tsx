"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function FinanceFilingUploadForm({ entityId }: { entityId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("업로드할 재무제표 파일(xls/xlsx)을 선택하세요.");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("file", file);

    try {
      const res = await fetch(`/api/finance/entities/${entityId}/filings`, { method: "POST", body: formData });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "재무제표 업로드에 실패했습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.push(`/dashboard/finance/${entityId}/filings/${json.filing.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "재무제표 업로드에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--sub)]">재무제표 업로드</h2>
      <p className="text-[11px] text-[var(--sub)]">
        资产负债表·利润表·现金流量表 3개 표가 모두 포함된 소기업회계준칙 신고 양식(.xls/.xlsx) 1개를 업로드하세요. 같은
        기간(월)을 다시 업로드하면 이전 데이터를 대체합니다.
      </p>
      <input ref={fileInputRef} name="file" type="file" accept=".xls,.xlsx" className="text-xs" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "업로드 및 분석 중..." : "업로드"}
        </button>
      </div>
    </form>
  );
}
