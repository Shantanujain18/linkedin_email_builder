import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { getStatusBootstrap } from "@/lib/db";
import { getExtensionConfig } from "@/lib/extension-version";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (!isUser(user)) return user;

  const [bootstrap, extension] = await Promise.all([
    getStatusBootstrap(user.id),
    getExtensionConfig()
  ]);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    profile: bootstrap.profile,
    smtp: bootstrap.smtp,
    quota: bootstrap.quota,
    counts: bootstrap.counts,
    extension: {
      required_version: extension.required_version,
      update_url: extension.update_url,
      message: extension.message
    }
  });
}
