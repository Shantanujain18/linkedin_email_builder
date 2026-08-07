import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  getAllDailyQuotas,
  getPublicProfile,
  getPublicSmtpSettings,
  getWorkspaceCounts
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  const profile = await getPublicProfile(user.id);
  const topSkills = String((profile as Record<string, unknown> | null)?.top_skills || "");
  const counts = await getWorkspaceCounts(user.id, topSkills);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    profile,
    smtp: await getPublicSmtpSettings(user.id),
    quota: await getAllDailyQuotas(user.id),
    counts: {
      posts: counts.posts,
      drafts: counts.drafts
    }
  });
}
