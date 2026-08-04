"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  contentItemId: string;
  variantId: string;
  initial: {
    title: string;
    body: string;
    hashtags: string[];
    ctaText: string;
    altText: string;
  };
};

export function VariantEditForm({ contentItemId, variantId, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [hashtagsInput, setHashtagsInput] = useState(initial.hashtags.join(", "));
  const [ctaText, setCtaText] = useState(initial.ctaText);
  const [altText, setAltText] = useState(initial.altText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hashtags = hashtagsInput
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/content-items/${contentItemId}/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          body: body.trim(),
          hashtags,
          ctaText: ctaText.trim() || null,
          altText: altText.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "저장에 실패했습니다.");
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="title">
            제목
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="body">
            본문
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={10}
            className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="hashtags">
            해시태그 (쉼표로 구분)
          </label>
          <input
            id="hashtags"
            value={hashtagsInput}
            onChange={(e) => setHashtagsInput(e.target.value)}
            placeholder="ai, marketing, china"
            className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="ctaText">
            CTA 문구
          </label>
          <input
            id="ctaText"
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            maxLength={500}
            className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="altText">
            대체 텍스트(alt)
          </label>
          <input
            id="altText"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            maxLength={1000}
            className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && !error && <p className="text-xs text-[var(--accent)]">저장되었습니다.</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 self-start rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
      </form>

      <div>
        <p className="text-xs font-semibold text-[var(--sub)]">모바일 미리보기</p>
        <div className="mt-2 mx-auto w-full max-w-[320px] rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
          {title.trim() && <p className="text-sm font-bold">{title}</p>}
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink)]">{body || "(본문 없음)"}</p>
          {hashtags.length > 0 && (
            <p className="mt-2 text-xs text-[var(--accent)]">{hashtags.map((h) => `#${h}`).join(" ")}</p>
          )}
          {ctaText.trim() && (
            <p className="mt-3 rounded-md bg-[var(--accent-soft)] px-3 py-1.5 text-center text-xs font-semibold text-[var(--accent)]">
              {ctaText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
