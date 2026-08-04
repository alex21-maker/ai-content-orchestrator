"use client";

import { useState } from "react";

type ChannelResult = {
  channel: string;
  succeeded: boolean;
  skipped?: boolean;
  externalPostId?: string;
  externalUrl?: string;
  error?: string;
};

export function PublishMockButton({ contentItemId }: { contentItemId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ChannelResult[] | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/publish`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "배포에 실패했습니다.");
      }
      setResults(json.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "배포에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!results && (
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? "배포 중..." : "배포 (mock)"}
        </button>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {results && (
        <div className="w-full max-w-xs rounded-lg border border-[var(--line)] bg-white p-3 text-left">
          <span className="mock-badge">MOCK — 실제 게시 아님</span>
          <ul className="mt-2 space-y-1.5">
            {results.map((r) => (
              <li key={r.channel} className="text-xs">
                <span className="font-semibold">{r.channel}</span>{" "}
                {r.succeeded ? (
                  <span className="text-[var(--accent)]">성공{r.skipped ? " (이미 게시됨)" : ""}</span>
                ) : (
                  <span className="text-red-600">실패{r.error ? `: ${r.error}` : ""}</span>
                )}
                {r.externalUrl && (
                  <>
                    {" · "}
                    <a
                      href={r.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-[var(--sub)]"
                    >
                      (mock) 게시물 보기
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
