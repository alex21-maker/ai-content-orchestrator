// Uploads a recorded meeting's audio file to a shared Google Drive folder
// using a service account. The target folder must be shared with the
// service account's email (as Editor) for this to work.

import { google } from "googleapis";
import { Readable } from "node:stream";

function loadServiceAccountKey(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 환경변수가 설정되어 있지 않습니다.");
  }
  // Accept either the raw JSON string or a base64-encoded copy of it (base64
  // is more forgiving of platform env-var UI quoting/newline mangling).
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

export async function uploadAudioToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ id: string; webViewLink: string }> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되어 있지 않습니다.");
  }

  const key = loadServiceAccountKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });

  if (!res.data.id || !res.data.webViewLink) {
    throw new Error("Google Drive 업로드 응답에 파일 정보가 없습니다.");
  }
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}
