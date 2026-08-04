"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewCampaignForm() {
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
      brief: String(data.get("brief") ?? "").trim(),
      goal: String(data.get("goal") ?? "").trim() || undefined,
      targetPersona: String(data.get("targetPersona") ?? "").trim() || undefined,
      funnelStage: String(data.get("funnelStage") ?? "").trim() || undefined,
    };

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "캠페인 생성에 실패했습니다.");
      }
      form.reset();
      setOpen(false);
      router.push(`/dashboard/campaigns/${json.campaign.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "캠페인 생성에 실패했습니다.");
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
        + 새 캠페인
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
          캠페인 이름
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="brief">
          브리프
        </label>
        <textarea
          id="brief"
          name="brief"
          required
          rows={3}
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="goal">
          목표 (선택)
        </label>
        <input
          id="goal"
          name="goal"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="targetPersona">
          타겟 페르소나 (선택)
        </label>
        <input
          id="targetPersona"
          name="targetPersona"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="funnelStage">
          퍼널 단계 (선택)
        </label>
        <input
          id="funnelStage"
          name="funnelStage"
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
          {submitting ? "생성 중..." : "캠페인 만들기"}
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
