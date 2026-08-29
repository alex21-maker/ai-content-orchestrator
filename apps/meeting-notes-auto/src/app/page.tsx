"use client";

import { useRef, useState } from "react";

interface ActionItem {
  text: string;
  owner: string | null;
}

interface AnalysisResult {
  driveLink: string;
  transcript: string;
  analysis: {
    title: string;
    summaryKo: string;
    summaryZh: string;
    decisions: string[];
    actionItems: ActionItem[];
    risks: string[];
  };
  slack: { mode: "MOCK" | "PRODUCTION"; succeeded: boolean; errorMessage?: string };
}

type Stage = "idle" | "recording" | "uploading" | "transcribing" | "analyzing" | "done" | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  recording: "녹음 중...",
  uploading: "구글 드라이브에 업로드 중...",
  transcribing: "음성을 텍스트로 변환 중 (Whisper)...",
  analyzing: "AI가 회의 내용을 분석 중 (Claude)...",
  done: "완료!",
  error: "오류가 발생했습니다.",
};

export default function Home() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  function drawVisualizer() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#c0392b";
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128;
      const y = (v * height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    rafRef.current = requestAnimationFrame(drawVisualizer);
  }

  function stopVisualizer() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function startRecording() {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopVisualizer();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void processRecording(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStage("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      // Live waveform — separate from MediaRecorder, purely for visual
      // feedback that the mic is actually picking up sound.
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      drawVisualizer();
    } catch {
      setError("마이크 접근 권한이 필요합니다.");
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  async function processRecording(blob: Blob) {
    setStage("uploading");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      // The single /api/process call does upload+STT+analysis+Slack
      // server-side; these intermediate stage labels are a best-effort
      // progress indicator, not real per-step events (no streaming yet).
      setStage("transcribing");
      const uploadPromise = fetch("/api/process", { method: "POST", body: formData });
      const stageTimer = setTimeout(() => setStage("analyzing"), 4000);

      const res = await uploadPromise;
      clearTimeout(stageTimer);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "처리에 실패했습니다.");
      }
      setResult(json);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리에 실패했습니다.");
      setStage("error");
    }
  }

  const isBusy = stage !== "idle" && stage !== "done" && stage !== "error";
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="wrap">
      <h1>회의록 자동화</h1>
      <p className="sub">녹음 → 구글 드라이브 저장 → AI 분석 → Slack 전달까지 한 번에</p>

      <div className="card" style={{ textAlign: "center" }}>
        {stage === "idle" || stage === "recording" ? (
          <>
            <button
              className={`record-btn ${stage === "recording" ? "recording" : "idle"}`}
              onClick={stage === "recording" ? stopRecording : startRecording}
            >
              {stage === "recording" ? "■ 회의 종료" : "● 회의 시작하기"}
            </button>
            {stage === "recording" && (
              <>
                <canvas ref={canvasRef} className="visualizer" width={600} height={80} />
                <div className="timer">
                  {mm}:{ss}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="status">{STAGE_LABEL[stage]}</div>
        )}

        {error && <div className="error">{error}</div>}

        {result && (
          <div className="result" style={{ textAlign: "left" }}>
            <div>
              <h2 style={{ fontSize: 18, textTransform: "none", color: "var(--ink)" }}>{result.analysis.title}</h2>
            </div>
            <div>
              <span className="pill">{result.slack.mode === "MOCK" ? "Slack 시뮬레이션" : "Slack 전송됨"}</span>
              {result.slack.mode === "PRODUCTION" && !result.slack.succeeded && (
                <span className="error"> — {result.slack.errorMessage}</span>
              )}
            </div>
            <div>
              <h2>🇰🇷 한국어 요약</h2>
              <p>{result.analysis.summaryKo}</p>
            </div>
            <div>
              <h2>🇨🇳 中文摘要</h2>
              <p>{result.analysis.summaryZh}</p>
            </div>
            <div>
              <h2>결정 사항</h2>
              {result.analysis.decisions.length === 0 ? (
                <p>없음</p>
              ) : (
                <ul>
                  {result.analysis.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2>액션 아이템</h2>
              {result.analysis.actionItems.length === 0 ? (
                <p>없음</p>
              ) : (
                <ul>
                  {result.analysis.actionItems.map((a, i) => (
                    <li key={i}>
                      {a.owner ? `${a.owner}: ` : ""}
                      {a.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2>리스크</h2>
              {result.analysis.risks.length === 0 ? (
                <p>없음</p>
              ) : (
                <ul>
                  {result.analysis.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
            <p>
              <a href={result.driveLink} target="_blank" rel="noreferrer">
                원본 녹음 파일 (Google Drive)
              </a>
            </p>
            <button
              className="record-btn idle"
              onClick={() => {
                setResult(null);
                setStage("idle");
              }}
            >
              새 회의 시작하기
            </button>
          </div>
        )}

        {isBusy && stage !== "recording" && <div className="status">잠시만 기다려주세요...</div>}
      </div>
    </div>
  );
}
