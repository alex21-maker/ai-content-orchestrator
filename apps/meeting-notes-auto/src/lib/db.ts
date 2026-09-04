// Minimal persistence for the meeting list + delete feature. This app is
// still no-login/no-org — there's exactly one shared list of meetings, no
// per-user scoping. Reuses the existing Supabase Postgres project (the same
// one the main ai-content-orchestrator app runs on) in its own table, to
// avoid provisioning and paying for a second database for such a small
// amount of data.

import { Pool } from "pg";
import type { MeetingAnalysis } from "./analysis";

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 환경변수가 설정되어 있지 않습니다.");
  }
  pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  return pool;
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `
      CREATE TABLE IF NOT EXISTS standalone_meeting_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_name TEXT NOT NULL,
        participants TEXT[] NOT NULL DEFAULT '{}',
        drive_file_id TEXT NOT NULL,
        drive_link TEXT NOT NULL,
        transcript TEXT NOT NULL,
        analysis JSONB NOT NULL,
        session_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE standalone_meeting_notes ADD COLUMN IF NOT EXISTS session_id TEXT;
    `
      )
      .then(() => undefined);
  }
  return schemaReady;
}

export interface MeetingRecord {
  id: string;
  projectName: string;
  participants: string[];
  driveFileId: string;
  driveLink: string;
  transcript: string;
  analysis: MeetingAnalysis;
  sessionId: string | null;
  createdAt: string;
}

function rowToRecord(row: {
  id: string;
  project_name: string;
  participants: string[];
  drive_file_id: string;
  drive_link: string;
  transcript: string;
  analysis: MeetingAnalysis;
  session_id: string | null;
  created_at: Date;
}): MeetingRecord {
  return {
    id: row.id,
    projectName: row.project_name,
    participants: row.participants,
    driveFileId: row.drive_file_id,
    driveLink: row.drive_link,
    transcript: row.transcript,
    analysis: row.analysis,
    sessionId: row.session_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertMeeting(input: {
  projectName: string;
  participants: string[];
  driveFileId: string;
  driveLink: string;
  transcript: string;
  analysis: MeetingAnalysis;
  sessionId: string;
}): Promise<MeetingRecord> {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO standalone_meeting_notes
       (project_name, participants, drive_file_id, drive_link, transcript, analysis, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.projectName,
      input.participants,
      input.driveFileId,
      input.driveLink,
      input.transcript,
      JSON.stringify(input.analysis),
      input.sessionId,
    ]
  );
  return rowToRecord(result.rows[0]);
}

export async function listMeetings(): Promise<MeetingRecord[]> {
  await ensureSchema();
  const result = await getPool().query(`SELECT * FROM standalone_meeting_notes ORDER BY created_at DESC`);
  return result.rows.map(rowToRecord);
}

// One recording session — a single "회의 시작하기" → "회의 종료" run — which
// may be split into multiple upload-size-limited parts (see the rollover
// behavior in processPart/startSegment on the client). Grouping by
// session_id (rather than by project name + part number) is what lets two
// separate meetings recorded under the same project name on different days
// stay distinct, since part numbering restarts at 1 within each session.
export interface MeetingSession {
  sessionKey: string;
  meetings: MeetingRecord[]; // ordered by part number ascending
  startedAt: string; // earliest part's createdAt
}

export interface MeetingGroup {
  projectName: string; // a real campaign name, or "기타" for anything unmatched
  sessions: MeetingSession[]; // newest session first
}

// Multi-part recordings from the upload-size rollover are suffixed "(N)" —
// strip that before comparing so all parts of one meeting still group and
// match under the same base name.
function normalizeProjectName(name: string): string {
  return name
    .trim()
    .replace(/\s*\(\d+\)\s*$/, "")
    .toLowerCase();
}

function partIndex(projectName: string): number {
  const match = projectName.match(/\((\d+)\)\s*$/);
  return match ? parseInt(match[1], 10) : 1;
}

function groupIntoSessions(meetings: MeetingRecord[]): MeetingSession[] {
  const bySessionKey = new Map<string, MeetingRecord[]>();
  for (const meeting of meetings) {
    // Rows written before session_id existed have none — treat each as its
    // own single-part session rather than merging unrelated old meetings.
    const key = meeting.sessionId ?? meeting.id;
    const bucket = bySessionKey.get(key);
    if (bucket) bucket.push(meeting);
    else bySessionKey.set(key, [meeting]);
  }

  const sessions: MeetingSession[] = Array.from(bySessionKey.entries()).map(([sessionKey, sessionMeetings]) => {
    const ordered = [...sessionMeetings].sort((a, b) => partIndex(a.projectName) - partIndex(b.projectName));
    const startedAt = ordered.reduce(
      (earliest, m) => (m.createdAt < earliest ? m.createdAt : earliest),
      ordered[0].createdAt
    );
    return { sessionKey, meetings: ordered, startedAt };
  });

  sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return sessions;
}

// Groups meetings by the campaign (project) they belong to in the main
// ai-content-orchestrator app (proj.lablab.cloud) — matched by name only,
// since the two apps share no auth or FK relationship (this app is
// deliberately no-login). A meeting whose project name doesn't match any
// existing campaign is grouped under "기타" rather than dropped. Within
// each project, meetings are further collapsed into sessions.
export async function listMeetingsGroupedByProject(): Promise<MeetingGroup[]> {
  const meetings = await listMeetings();

  let campaignNames: string[] = [];
  try {
    const campaignRows = await getPool().query<{ name: string }>(`SELECT DISTINCT name FROM campaigns`);
    campaignNames = campaignRows.rows.map((r) => r.name);
  } catch (err) {
    console.error("Failed to load campaign names for grouping:", err);
  }

  const campaignByNormalized = new Map<string, string>();
  for (const name of campaignNames) {
    campaignByNormalized.set(normalizeProjectName(name), name);
  }

  const projectBuckets = new Map<string, MeetingRecord[]>();
  for (const meeting of meetings) {
    const displayName = campaignByNormalized.get(normalizeProjectName(meeting.projectName)) ?? "기타";
    const bucket = projectBuckets.get(displayName);
    if (bucket) bucket.push(meeting);
    else projectBuckets.set(displayName, [meeting]);
  }

  const otherMeetings = projectBuckets.get("기타");
  projectBuckets.delete("기타");

  const sortedGroups: MeetingGroup[] = Array.from(projectBuckets.entries())
    .map(([projectName, groupMeetings]) => ({ projectName, sessions: groupIntoSessions(groupMeetings) }))
    .sort((a, b) => new Date(b.sessions[0].startedAt).getTime() - new Date(a.sessions[0].startedAt).getTime());

  if (otherMeetings) sortedGroups.push({ projectName: "기타", sessions: groupIntoSessions(otherMeetings) });

  return sortedGroups;
}

export async function getMeeting(id: string): Promise<MeetingRecord | null> {
  await ensureSchema();
  const result = await getPool().query(`SELECT * FROM standalone_meeting_notes WHERE id = $1`, [id]);
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export async function deleteMeeting(id: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM standalone_meeting_notes WHERE id = $1`, [id]);
}
