import { describe, it, expect } from "vitest";
import { detectLanguage, runMeetingAnalysisAgent } from "@/lib/agents/meeting-analysis";

describe("detectLanguage", () => {
  it("detects Korean-only text", () => {
    expect(detectLanguage("오늘 회의를 시작하겠습니다")).toBe("ko");
  });

  it("detects Chinese-only text", () => {
    expect(detectLanguage("我们需要在下周确定发货日期")).toBe("zh");
  });

  it("detects mixed ko/zh code-switching as mixed", () => {
    expect(detectLanguage("这个项目 다음 주까지 완료해야 합니다")).toBe("mixed");
  });

  it("returns other for text with neither script", () => {
    expect(detectLanguage("Let's sync next week.")).toBe("other");
  });
});

describe("runMeetingAnalysisAgent", () => {
  const bilingualTranscript = [
    "김민준: 오늘 안건은 3분기 협력 일정입니다.",
    "王芳: 我们需要在下周确定发货日期。",
    "김민준: 이 부분은 리스크가 있어 보입니다. 일정 지연 우려가 있습니다.",
    "王芳: 好的，我们决定下周五之前完成确认。",
    "김민준: 그럼 제가 다음 주까지 확인 자료를 정리해서 공유하겠습니다.",
  ].join("\n");

  it("returns a completed result with per-language statement counts", () => {
    const result = runMeetingAnalysisAgent({ title: "한중 협력 회의", transcriptText: bilingualTranscript });
    expect(result.status).toBe("completed");
    expect(result.agent).toBe("MEETING_ANALYSIS");

    const artifact = result.artifacts[0] as {
      languageBreakdown: Record<string, number>;
      keyStatementsKo: unknown[];
      keyStatementsZh: unknown[];
      decisions: unknown[];
      actionItems: { ownerGuess: string | null }[];
      meetingRisks: unknown[];
    };

    expect(artifact.languageBreakdown.ko).toBeGreaterThan(0);
    expect(artifact.languageBreakdown.zh).toBeGreaterThan(0);
    expect(artifact.keyStatementsKo.length).toBeGreaterThan(0);
    expect(artifact.keyStatementsZh.length).toBeGreaterThan(0);
    expect(artifact.decisions.length).toBeGreaterThan(0);
    expect(artifact.actionItems.length).toBeGreaterThan(0);
    expect(artifact.meetingRisks.length).toBeGreaterThan(0);
    // Speaker attribution from "이름: 발언" lines feeds the owner guess.
    expect(artifact.actionItems.some((a) => a.ownerGuess === "김민준")).toBe(true);
  });

  it("is deterministic — same input yields the same extraction", () => {
    const a = runMeetingAnalysisAgent({ title: "회의", transcriptText: bilingualTranscript });
    const b = runMeetingAnalysisAgent({ title: "회의", transcriptText: bilingualTranscript });
    expect(a.artifacts).toEqual(b.artifacts);
    expect(a.confidence).toBe(b.confidence);
  });

  it("returns blocked status when the transcript has no analyzable sentences", () => {
    const result = runMeetingAnalysisAgent({ title: "빈 회의", transcriptText: "   \n  \n" });
    expect(result.status).toBe("blocked");
    expect(result.confidence).toBe(0);
  });

  it("flags low language coverage as a risk when most text is unclassified", () => {
    const result = runMeetingAnalysisAgent({
      title: "English-only meeting",
      transcriptText: "Let's sync next week. We should finalize the plan. Everyone agreed.",
    });
    expect(result.risks.some((r) => r.level === "medium")).toBe(true);
  });
});
