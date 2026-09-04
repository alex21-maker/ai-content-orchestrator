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

interface MeetingListItem {
  id: string;
  projectName: string;
  participants: string[];
  driveLink: string;
  transcript: string;
  analysis: Analysis;
  createdAt: string;
}

interface MeetingSession {
  sessionKey: string;
  meetings: MeetingListItem[]; // ordered by part number ascending
  startedAt: string;
}

interface MeetingGroup {
  projectName: string; // a matched campaign name, or "기타" for anything unmatched
  sessions: MeetingSession[];
}

interface PartStatus {
  index: number;
  status: "processing" | "done" | "error";
  title?: string;
  message?: string;
}

type Stage = "idle" | "recording";

// Vercel serverless functions reject request bodies over ~4.5MB before our
// route handler ever runs. Rolling the recording over to a new segment
// comfortably under that (leaving room for multipart overhead and the other
// form fields) lets a long meeting keep recording uninterrupted, split into
// multiple uploaded/analyzed parts instead of failing outright.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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

// A response that never reaches our route handler (Vercel's ~4.5MB body
// limit, a platform-level 5xx/timeout page) comes back as plain text, not
// JSON — res.json() on that throws a raw, unreadable parse error instead of
// a message the user can act on.
async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const bodyText = await res.text();
  try {
    return JSON.parse(bodyText);
  } catch {
    if (!res.ok && /request entity too large/i.test(bodyText)) {
      throw new Error("녹음 파일이 너무 큽니다 (최대 약 4.5MB). 더 짧게 녹음한 뒤 다시 시도해주세요.");
    }
    throw new Error(`서버 응답이 올바르지 않습니다 (HTTP ${res.status}): ${bodyText.slice(0, 100)}`);
  }
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
  const bytesRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const partIndexRef = useRef(1);
  const sessionIdRef = useRef("");
  const finalizingRef = useRef(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingName, setMeetingName] = useState("");
  const [participants, setParticipants] = useState("");
  const [parts, setParts] = useState<PartStatus[]>([]);

  const [meetingGroups, setMeetingGroups] = useState<MeetingGroup[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [expandedSessionKey, setExpandedSessionKey] = useState<string | null>(null);
  const [expandedPartId, setExpandedPartId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  async function loadMeetings() {
    try {
      const res = await fetch("/api/meetings");
      const json = await parseJsonResponse(res);
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "회의록 목록을 불러오지 못했습니다.");
      const groups = json.groups as MeetingGroup[];
      setMeetingGroups(groups);
      // Default to the first project on first load only — don't yank the
      // user back to it on every background refetch.
      setSelectedProject((prev) => prev ?? groups[0]?.projectName ?? null);
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
      const json = await parseJsonResponse(res);
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "삭제에 실패했습니다.");
      setMeetingGroups((prev) =>
        prev
          ? prev
              .map((group) => ({
                ...group,
                sessions: group.sessions
                  .map((session) => ({ ...session, meetings: session.meetings.filter((m) => m.id !== id) }))
                  .filter((session) => session.meetings.length > 0),
              }))
              .filter((group) => group.sessions.length > 0)
          : prev
      );
      if (expandedPartId === id) setExpandedPartId(null);
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

  // Uploads/transcribes/analyzes one recorded segment in the background —
  // recording (possibly of the next part already) is never blocked on this.
  async function processPart(blob: Blob, index: number) {
    setParts((prev) => [...prev, { index, status: "processing" }]);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("meetingName", `${meetingName.trim()} (${index})`);
      formData.append("participants", participants.trim());
      formData.append("sessionId", sessionIdRef.current);
      const res = await fetch("/api/process", { method: "POST", body: formData });
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "처리에 실패했습니다.");
      }
      const analysis = json.analysis as Analysis | undefined;
      setParts((prev) => prev.map((p) => (p.index === index ? { ...p, status: "done", title: analysis?.title } : p)));
      void loadMeetings();
    } catch (err) {
      const message = err instanceof Error ? err.message : "처리에 실패했습니다.";
      setParts((prev) => prev.map((p) => (p.index === index ? { ...p, status: "error", message } : p)));
    }
  }

  // Records one segment on the shared stream. When it stops because the
  // upload-size limit was hit mid-recording, immediately starts the next
  // segment on the same stream so recording continues without the user
  // noticing — MediaRecorder can only produce a valid, decodable file by
  // calling stop() (a timeslice chunk alone isn't independently playable),
  // so a brief recorder handoff is unavoidable to split the audio at all.
  function startSegment() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    bytesRef.current = 0;
    const recorder = new MediaRecorder(stream);
    const myIndex = partIndexRef.current;
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      chunksRef.current.push(e.data);
      bytesRef.current += e.data.size;
      if (bytesRef.current >= MAX_UPLOAD_BYTES && !finalizingRef.current) {
        recorder.stop();
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      void processPart(blob, myIndex);
      if (finalizingRef.current) {
        stopVisualizer();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        partIndexRef.current += 1;
        startSegment();
      }
    };
    recorder.start(1000);
    mediaRecorderRef.current = recorder;
  }

  async function startRecording() {
    setError(null);
    setParts([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      partIndexRef.current = 1;
      sessionIdRef.current =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      finalizingRef.current = false;
      setStage("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      // Live waveform — separate from MediaRecorder, purely for visual
      // feedback that the mic is actually picking up sound. Tied to the
      // stream, not to individual recorded segments, so it keeps running
      // uninterrupted across a segment rollover.
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      drawVisualizer();

      startSegment();
    } catch {
      setError("마이크 접근 권한이 필요합니다.");
    }
  }

  function stopRecording() {
    finalizingRef.current = true;
    mediaRecorderRef.current?.stop();
    setStage("idle");
    setMeetingName("");
    setParticipants("");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const selectedGroup = meetingGroups?.find((g) => g.projectName === selectedProject) ?? null;

  return (
    <div className="wrap">
      <h1>회의록 자동화</h1>
      <p className="sub">녹음 → 구글 드라이브 저장 → AI 분석 → Slack 전달까지 한 번에</p>

      <div className="card" style={{ textAlign: "center" }}>
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

        {error && <div className="error">{error}</div>}

        {parts.length > 0 && (
          <div className="parts-panel">
            <h2>처리 현황 (약 4MB마다 자동으로 파트가 나뉩니다)</h2>
            <ul>
              {parts.map((p) => (
                <li key={p.index}>
                  파트 {p.index}:{" "}
                  {p.status === "processing"
                    ? "처리 중..."
                    : p.status === "done"
                      ? `완료${p.title ? ` — ${p.title}` : ""}`
                      : `오류 — ${p.message}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h2 className="list-heading">회의록 리스트</h2>
      {listError && <div className="error">{listError}</div>}
      {meetingGroups === null && !listError && <p className="sub">불러오는 중...</p>}
      {meetingGroups !== null && meetingGroups.length === 0 && <p className="sub">아직 저장된 회의록이 없습니다.</p>}

      {meetingGroups !== null && meetingGroups.length > 0 && (
        <div className="layout">
          <aside className="sidebar">
            <nav className="project-nav">
              {meetingGroups.map((group) => (
                <button
                  key={group.projectName}
                  className={`project-nav-item ${selectedProject === group.projectName ? "active" : ""} ${
                    group.projectName === "기타" ? "other" : ""
                  }`}
                  onClick={() => setSelectedProject(group.projectName)}
                >
                  <span>{group.projectName}</span>
                  <span className="project-nav-count">{group.sessions.length}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="main-content">
            {selectedGroup && (
              <>
                <h3 className={`project-group-heading ${selectedGroup.projectName === "기타" ? "other" : ""}`}>
                  {selectedGroup.projectName}
                </h3>
                <div className="meeting-list">
                  {selectedGroup.sessions.map((session) => {
                    const isSessionExpanded = expandedSessionKey === session.sessionKey;
                    const first = session.meetings[0];
                    const isMultiPart = session.meetings.length > 1;
                    return (
                      <div key={session.sessionKey} className="card meeting-item">
                        <div
                          className="meeting-item-header"
                          onClick={() => setExpandedSessionKey(isSessionExpanded ? null : session.sessionKey)}
                        >
                          <div>
                            <p className="sub" style={{ margin: 0 }}>
                              {new Date(session.startedAt).toLocaleString("ko-KR")}
                              {first.participants.length > 0 && ` · ${first.participants.join(", ")}`}
                            </p>
                            <p className="meeting-item-title">
                              {first.analysis.title}
                              {isMultiPart && ` (${session.meetings.length}개 파트)`}
                            </p>
                          </div>
                          <div className="meeting-item-actions">
                            <span className="expand-arrow">{isSessionExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>
                        {isSessionExpanded && (
                          <div className="session-parts">
                            {session.meetings.map((meeting, i) => {
                              const isPartExpanded = expandedPartId === meeting.id;
                              return (
                                <div key={meeting.id} className="part-item">
                                  <div
                                    className="part-item-header"
                                    onClick={() => setExpandedPartId(isPartExpanded ? null : meeting.id)}
                                  >
                                    <span className="part-item-title">
                                      {isMultiPart ? `파트 ${i + 1} — ` : ""}
                                      {meeting.analysis.title}
                                    </span>
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
                                      <span className="expand-arrow">{isPartExpanded ? "▲" : "▼"}</span>
                                    </div>
                                  </div>
                                  {isPartExpanded && (
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
