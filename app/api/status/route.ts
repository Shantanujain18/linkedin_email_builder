import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import {
  getAllDailyQuotas,
  getPublicProfile,
  getPublicSmtpSettings,
  getWorkspaceCounts
} from "@/lib/db";
import { getExtensionConfig } from "@/lib/extension-version";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  const [profile, smtp, quota, counts, extension] = await Promise.all([
    getPublicProfile(user.id),
    getPublicSmtpSettings(user.id),
    getAllDailyQuotas(user.id),
    getWorkspaceCounts(user.id),
    getExtensionConfig()
  ]);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    profile,
    smtp,
    quota,
    counts: {
      posts: counts.posts,
      drafts: counts.drafts
    },
    extension: {
      required_version: extension.required_version,
      update_url: extension.update_url,
      message: extension.message
    }
  });
}
