// Speech-to-text via OpenAI's Whisper API. Handles Korean/Chinese mixed audio
// reasonably well since Whisper auto-detects language per segment.

export async function transcribeAudio(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다.");
  }

  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Whisper API가 ${res.status}를 반환했습니다: ${errorText.slice(0, 300)}`);
  }

  const transcript = await res.text();
  return transcript.trim();
}
