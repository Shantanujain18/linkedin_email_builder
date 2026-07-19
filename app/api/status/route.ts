import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  getAllDailyQuotas,
  getNotesByDraftIds,
  getPosts,
  getPublicProfile,
  getPublicSmtpSettings,
  listDrafts
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  const rows = await listDrafts(user.id);
  const notesByDraft = await getNotesByDraftIds(rows.map((row) => Number(row.id)));

  const drafts = rows.map((draft) => ({
    ...draft,
    called: Boolean(draft.called),
    replied: Boolean(draft.replied),
    notes: notesByDraft[Number(draft.id)] || []
  }));

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    profile: await getPublicProfile(user.id),
    posts: await getPosts(user.id),
    drafts,
    smtp: await getPublicSmtpSettings(user.id),
    quota: await getAllDailyQuotas(user.id)
  });
}
