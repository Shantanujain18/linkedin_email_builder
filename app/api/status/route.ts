import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  getAllDailyQuotas,
  getPostsForDashboard,
  getPublicProfile,
  getPublicSmtpSettings,
  listDrafts
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  // Parallelize independent reads — was ~6 sequential round-trips.
  const [draftRows, profile, posts, smtp, quota] = await Promise.all([
    listDrafts(user.id),
    getPublicProfile(user.id),
    getPostsForDashboard(user.id),
    getPublicSmtpSettings(user.id),
    getAllDailyQuotas(user.id)
  ]);

  const drafts = draftRows.map((draft) => ({
    ...draft,
    called: Boolean(draft.called),
    replied: Boolean(draft.replied),
    notes: [] as Array<{ id: number; draft_id: number; note: string; created_at: string }>
  }));

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    profile,
    posts,
    drafts,
    smtp,
    quota
  });
}
