"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewContentItemForm({ campaignId }: { campaignId: string }) {
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
      title: String(data.get("title") ?? "").trim(),
      coreIdea: String(data.get("coreIdea") ?? "").trim() || undefined,
    };

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/content-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "콘텐츠 아이디어 생성에 실패했습니다.");
      }
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "콘텐츠 아이디어 생성에 실패했습니다.");
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
        + 새 콘텐츠 아이디어
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex w-full max-w-lg flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-4"
    >
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="title">
          제목
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={300}
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="coreIdea">
          핵심 아이디어 (선택)
        </label>
        <textarea
          id="coreIdea"
          name="coreIdea"
          rows={3}
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
          {submitting ? "생성 중..." : "아이디어 추가"}
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
