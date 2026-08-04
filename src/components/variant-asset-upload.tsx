"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function VariantAssetUpload({ contentItemId, variantId }: { contentItemId: string; variantId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("이미지 파일을 선택하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/content-items/${contentItemId}/variants/${variantId}/assets`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "업로드에 실패했습니다.");
      }
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" name="file" accept="image/*" className="text-xs" />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        {submitting ? "업로드 중..." : "이미지 업로드"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </form>
  );
}
