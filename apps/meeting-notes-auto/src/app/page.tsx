"use client";

import { useEffect, useRef, useState } from "react";

interface ActionItem {
  text: string;
  owner: string | null;
}

interface SpeakerSegment {
  speaker: string;
  text: string;
}

interface Analysis {
  title: string;
  summaryKo: string;
  summaryZh: string;
  decisions: string[];
  actionItems: ActionItem[];
  risks: string[];
  speakerSegments: SpeakerSegment[];
}

interface AnalysisResult {
  id: string | null;
  driveLink: string;
  transcript: string;
  meetingName: string;
  participants: string[];
  analysis: Analysis;
  slack: { mode: "MOCK" | "PRODUCTION"; succeeded: boolean; errorMessage?: string };
}

interface MeetingListItem {
  id: string;
  projectName: string;
  participants: string[];
  driveLink: string;
  transcript: string;
  analysis: Analysis;
  createdAt: string;
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

function bulletOrNone(items: string[]) {
  return items.length === 0 ? (
    <p>없음</p>
  ) : (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function AnalysisDetails({
  analysis,
  transcript,
  driveLink,
}: {
  analysis: Analysis;
  transcript: string;
  driveLink: string;
}) {
  return (
    <>
      <div>
        <h2>🇰🇷 한국어 요약</h2>
        <p>{analysis.summaryKo}</p>
      </div>
      <div>
        <h2>🇨🇳 中文摘要</h2>
        <p>{analysis.summaryZh}</p>
      </div>
      <div>
        <h2>결정 사항</h2>
        {bulletOrNone(analysis.decisions)}
      </div>
      <div>
        <h2>액션 아이템</h2>
        {analysis.actionItems.length === 0 ? (
          <p>없음</p>
        ) : (
          <ul>
            {analysis.actionItems.map((a, i) => (
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
        {bulletOrNone(analysis.risks)}
      </div>
      <div>
        <h2>화자 구분 (AI 추정 — 정확하지 않을 수 있음)</h2>
        {analysis.speakerSegments.length === 0 ? (
          <p>없음</p>
        ) : (
          <div className="speaker-segments">
            {analysis.speakerSegments.map((seg, i) => (
              <p key={i}>
                <strong>{seg.speaker}:</strong> {seg.text}
              </p>
            ))}
          </div>
        )}
      </div>
      <div>
        <h2>원문 전체</h2>
        <p className="transcript-full">{transcript}</p>
      </div>
      <p>
        <a href={driveLink} target="_blank" rel="noreferrer">
          원본 녹음 파일 (Google Drive)
        </a>
      </p>
    </>
  );
}

export default function Home() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingName, setMeetingName] = useState("");
  const [participants, setParticipants] = useState("");

  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  async function loadMeetings() {
    try {
      const res = await fetch("/api/meetings");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "회의록 목록을 불러오지 못했습니다.");
      setMeetings(json.meetings);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "회의록 목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void loadMeetings();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("이 회의록과 원본 녹음 파일을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "삭제에 실패했습니다.");
      setMeetings((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  function drawVisualizer() {
    const analyser = analyserRef.current;
    if (!analyser) return; // recording stopped

    const canvas = canvasRef.current;
    if (!canvas) {
      // The <canvas> only mounts once React finishes the "recording" stage
      // re-render, which hasn't happened yet on the very first call — keep
      // polling each frame instead of silently giving up on the loop.
      rafRef.current = requestAnimationFrame(drawVisualizer);
      return;
    }
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
      formData.append("meetingName", meetingName.trim());
      formData.append("participants", participants.trim());

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
      void loadMeetings();
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
            {stage === "idle" && (
              <>
                <input
                  type="text"
                  value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                  placeholder="회의/프로젝트 이름을 입력하세요"
                  className="name-input"
                />
                <input
                  type="text"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  placeholder="회의 참가자 이름 (쉼표로 구분, 예: 김철수, 왕리)"
                  className="name-input"
                />
              </>
            )}
            <button
              className={`record-btn ${stage === "recording" ? "recording" : "idle"}`}
              onClick={stage === "recording" ? stopRecording : startRecording}
              disabled={stage === "idle" && meetingName.trim().length === 0}
            >
              {stage === "recording" ? "■ 회의 종료" : "● 회의 시작하기"}
            </button>
            {stage === "recording" && (
              <>
                <div className="rec-indicator">
                  <span className="rec-dot" /> 녹음 중
                </div>
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
            {result.meetingName && (
              <p className="sub" style={{ margin: 0 }}>
                {result.meetingName}
                {result.participants.length > 0 && ` · ${result.participants.join(", ")}`}
              </p>
            )}
            <div>
              <h2 style={{ fontSize: 18, textTransform: "none", color: "var(--ink)" }}>{result.analysis.title}</h2>
            </div>
            <div>
              <span className="pill">{result.slack.mode === "MOCK" ? "Slack 시뮬레이션" : "Slack 전송됨"}</span>
              {result.slack.mode === "PRODUCTION" && !result.slack.succeeded && (
                <span className="error"> — {result.slack.errorMessage}</span>
              )}
            </div>
            <AnalysisDetails analysis={result.analysis} transcript={result.transcript} driveLink={result.driveLink} />
            <button
              className="record-btn idle"
              onClick={() => {
                setResult(null);
                setStage("idle");
                setMeetingName("");
                setParticipants("");
              }}
            >
              새 회의 시작하기
            </button>
          </div>
        )}

        {isBusy && stage !== "recording" && <div className="status">잠시만 기다려주세요...</div>}
      </div>

      <h2 className="list-heading">회의록 리스트</h2>
      {listError && <div className="error">{listError}</div>}
      {meetings === null && !listError && <p className="sub">불러오는 중...</p>}
      {meetings !== null && meetings.length === 0 && <p className="sub">아직 저장된 회의록이 없습니다.</p>}

      <div className="meeting-list">
        {meetings?.map((meeting) => {
          const isExpanded = expandedId === meeting.id;
          return (
            <div key={meeting.id} className="card meeting-item">
              <div className="meeting-item-header" onClick={() => setExpandedId(isExpanded ? null : meeting.id)}>
                <div>
                  <p className="sub" style={{ margin: 0 }}>
                    {new Date(meeting.createdAt).toLocaleString("ko-KR")}
                    {meeting.participants.length > 0 && ` · ${meeting.participants.join(", ")}`}
                  </p>
                  <p className="meeting-item-title">
                    {meeting.projectName} — {meeting.analysis.title}
                  </p>
                </div>
                <div className="meeting-item-actions">
                  <button
                    className="delete-btn"
                    disabled={deletingId === meeting.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(meeting.id);
                    }}
                  >
                    {deletingId === meeting.id ? "삭제 중..." : "삭제"}
                  </button>
                  <span className="expand-arrow">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExpanded && (
                <div className="result" style={{ textAlign: "left" }}>
                  <AnalysisDetails
                    analysis={meeting.analysis}
                    transcript={meeting.transcript}
                    driveLink={meeting.driveLink}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
