// Uploads a recorded meeting's audio file to a Google Drive folder using
// OAuth 2.0 (a refresh token for the folder owner's own account) — NOT a
// service account. Service accounts have zero storage quota of their own,
// and personal (non-Workspace) Gmail accounts can't use Shared Drives or
// domain-wide delegation to work around that, so uploads must run as the
// real account whose quota the files should count against.

import { google } from "googleapis";
import { Readable } from "node:stream";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN 환경변수가 필요합니다."
    );
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
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

  const auth = getOAuthClient();
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
