"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Phase 1 has no speech-to-text (STT) connector configured — audio can be
// recorded/uploaded and stored (see MeetingRecorder), but turning it into
// text still requires a person to paste/type the transcript here. Phase 2
// TODO: wire a real STT provider (e.g. Whisper, Clova Speech) and prefill
// this textarea automatically.
export function MeetingTranscriptForm({ meetingId, initialText }: { meetingId: string; initialText: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const transcriptText = String(data.get("transcriptText") ?? "").trim();
    const audioFile = fileInputRef.current?.files?.[0];

    if (!transcriptText && !audioFile) {
      setError("회의록 텍스트를 입력하거나 음성 파일을 선택하세요.");
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    if (transcriptText) formData.set("transcriptText", transcriptText);
    if (audioFile) formData.set("audio", audioFile);

    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcript`, { method: "POST", body: formData });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "회의록 등록에 실패했습니다.");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "회의록 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-[var(--sub)]" htmlFor="transcriptText">
        회의록 텍스트 (한국어/中文 병행 가능 — 화자 구분은 &quot;이름: 발언&quot; 형식 권장)
      </label>
      <textarea
        id="transcriptText"
        name="transcriptText"
        rows={10}
        defaultValue={initialText ?? ""}
        placeholder={"김민준: 오늘 안건은 3분기 협력 일정입니다.\n王芳: 我们需要在下周确定发货日期。"}
        className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--sub)]" htmlFor="audio">
          또는 음성 파일 업로드:
        </label>
        <input ref={fileInputRef} id="audio" name="audio" type="file" accept="audio/*" className="text-xs" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "저장 중..." : "회의록 저장"}
        </button>
      </div>
    </form>
  );
}
