"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Real browser-based recording via MediaRecorder — no external service
// needed. What it produces is an audio file attached to the meeting; turning
// it into text still needs a person (Phase 1 has no STT connector — see
// MeetingTranscriptForm's comment).
export function MeetingRecorder({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () => typeof window !== "undefined" && Boolean(navigator.mediaDevices) && typeof window.MediaRecorder !== "undefined"
  );

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("마이크 접근 권한이 필요합니다.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function upload() {
    if (!audioBlob) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("audio", audioBlob, `recording-${Date.now()}.webm`);
      const res = await fetch(`/api/meetings/${meetingId}/transcript`, { method: "POST", body: formData });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "업로드에 실패했습니다.");
      setAudioBlob(null);
      setAudioUrl(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-[var(--sub)]">
        이 브라우저는 녹음 기능을 지원하지 않습니다. 아래에서 음성 파일을 직접 업로드하세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--line)] p-3">
      <p className="text-xs font-semibold text-[var(--sub)]">브라우저 녹음</p>
      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            ● 녹음 시작
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]"
          >
            ■ 녹음 정지
          </button>
        )}
        {audioUrl && (
          <>
            <audio controls src={audioUrl} className="h-8" />
            <button
              type="button"
              onClick={upload}
              disabled={uploading}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : "회의에 첨부"}
            </button>
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <p className="text-[11px] text-[var(--sub)]">
        녹음 파일은 저장되지만 자동 음성인식(STT)은 아직 연동되지 않았습니다 — 분석하려면 회의록 텍스트를 별도로 입력하세요.
      </p>
    </div>
  );
}
