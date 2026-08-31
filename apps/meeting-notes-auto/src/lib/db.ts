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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
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
}): Promise<MeetingRecord> {
  await ensureSchema();
  const result = await getPool().query(
    `INSERT INTO standalone_meeting_notes
       (project_name, participants, drive_file_id, drive_link, transcript, analysis)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.projectName,
      input.participants,
      input.driveFileId,
      input.driveLink,
      input.transcript,
      JSON.stringify(input.analysis),
    ]
  );
  return rowToRecord(result.rows[0]);
}

export async function listMeetings(): Promise<MeetingRecord[]> {
  await ensureSchema();
  const result = await getPool().query(`SELECT * FROM standalone_meeting_notes ORDER BY created_at DESC`);
  return result.rows.map(rowToRecord);
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
