"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewFinanceEntityForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      name: String(data.get("name") ?? "").trim(),
      legalNameZh: String(data.get("legalNameZh") ?? "").trim() || undefined,
      taxId: String(data.get("taxId") ?? "").trim() || undefined,
    };

    try {
      const res = await fetch("/api/finance/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "법인 등록에 실패했습니다.");
      form.reset();
      setOpen(false);
      router.push(`/dashboard/finance/${json.entity.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "법인 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        + 새 법인 등록
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex w-full max-w-lg flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-4"
    >
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="name">
          법인 표시 이름
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          placeholder="예: 레이블 차이나"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="legalNameZh">
          중국 법인명 (선택, 비워두면 첫 업로드 시 파일에서 자동 인식)
        </label>
        <input
          id="legalNameZh"
          name="legalNameZh"
          maxLength={200}
          placeholder="예: 杭州嘞博贸易有限公司"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="taxId">
          纳税人识别号 (선택, 비워두면 첫 업로드 시 파일에서 자동 인식)
        </label>
        <input
          id="taxId"
          name="taxId"
          maxLength={50}
          placeholder="예: 91330108MACLG81U91"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "법인 등록"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[var(--line)] px-4 py-1.5 text-sm text-[var(--ink)]"
        >
          취소
        </button>
      </div>
    </form>
  );
}
