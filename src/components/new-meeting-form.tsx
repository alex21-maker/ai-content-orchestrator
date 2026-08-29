"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export function NewMeetingForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languages, setLanguages] = useState<string[]>(["ko", "zh"]);

  function toggleLanguage(value: string) {
    setLanguages((prev) => (prev.includes(value) ? prev.filter((l) => l !== value) : [...prev, value]));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const occurredAtRaw = String(data.get("occurredAt") ?? "").trim();
    const participantsRaw = String(data.get("participants") ?? "").trim();

    const payload = {
      title: String(data.get("title") ?? "").trim(),
      occurredAt: occurredAtRaw ? new Date(occurredAtRaw).toISOString() : undefined,
      languages: languages.length > 0 ? languages : undefined,
      participants: participantsRaw
        ? participantsRaw
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : undefined,
    };

    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "회의 등록에 실패했습니다.");
      }
      form.reset();
      setOpen(false);
      router.push(`/dashboard/meetings/${json.meeting.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "회의 등록에 실패했습니다.");
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
        + 새 회의
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
          회의 제목
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="예: 8월 3주차 한중 협력사 정기 회의"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="occurredAt">
          회의 일시 (선택, 비워두면 지금)
        </label>
        <input
          id="occurredAt"
          name="occurredAt"
          type="datetime-local"
          className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <span className="text-xs font-semibold text-[var(--sub)]">사용 언어</span>
        <div className="mt-1 flex gap-3">
          {LANGUAGE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={languages.includes(opt.value)}
                onChange={() => toggleLanguage(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="participants">
          참석자 (쉼표로 구분, 선택)
        </label>
        <input
          id="participants"
          name="participants"
          placeholder="예: 김민준, 王芳, Alex"
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
          {submitting ? "등록 중..." : "회의 등록"}
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
