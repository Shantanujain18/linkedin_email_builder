import { NextResponse } from "next/server";
import { db, getNotesByDraftIds, getPosts, getPublicProfile, getPublicSmtpSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const rows = db
    .prepare(`SELECT id, recipient_email, recipient_name, subject, body, status,
      phone, location, company, contact_name, hiring_summary, talking_points, job_post,
      matched_skills, called, called_at, replied, replied_at, post_id
      FROM email_drafts ORDER BY id DESC`)
    .all() as Array<Record<string, unknown>>;

  const notesByDraft = getNotesByDraftIds(rows.map((row) => Number(row.id)));

  const drafts = rows.map((draft) => ({
    ...draft,
    called: Number(draft.called) === 1,
    replied: Number(draft.replied) === 1,
    notes: notesByDraft[Number(draft.id)] || []
  }));

  return NextResponse.json({
    profile: getPublicProfile(),
    posts: getPosts(),
    drafts,
    smtp: getPublicSmtpSettings()
  });
}
