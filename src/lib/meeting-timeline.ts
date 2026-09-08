import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface MeetingTimelineEntry {
  id: string;
  projectName: string;
  participants: string[];
  meetingAt: string;
  summaryKo: string;
  driveLink: string;
}

interface StandaloneMeetingRow {
  [key: string]: unknown;
  id: string;
  project_name: string;
  participants: string[] | null;
  created_at: Date;
  drive_link: string;
  analysis: { summaryKo?: string } | null;
}

// The standalone meeting-notes-auto app (note.lablab.cloud) is a separate,
// no-login tool that writes its own `standalone_meeting_notes` table into
// this same Postgres database — it has no FK relationship to campaigns, so
// a meeting is matched to a campaign by name only (case-insensitive; a
// project name of "캠페인명 (2)" from a multi-part recording still matches
// "캠페인명"). If that table doesn't exist yet in some environment, treat
// it the same as "no meetings" rather than breaking the campaign page.
export async function getMeetingTimelineForCampaign(campaignName: string): Promise<MeetingTimelineEntry[]> {
  try {
    const result = await db.execute<StandaloneMeetingRow>(sql`
      SELECT id, project_name, participants, created_at, drive_link, analysis
      FROM standalone_meeting_notes
      WHERE lower(regexp_replace(project_name, '\s*\(\d+\)\s*$', '')) = lower(${campaignName.trim()})
      ORDER BY created_at DESC
    `);

    return result.rows.map((row) => ({
      id: row.id,
      projectName: row.project_name,
      participants: row.participants ?? [],
      meetingAt: row.created_at.toISOString(),
      summaryKo: row.analysis?.summaryKo ?? "",
      driveLink: row.drive_link,
    }));
  } catch (err) {
    console.error("Failed to load meeting timeline:", err);
    return [];
  }
}
