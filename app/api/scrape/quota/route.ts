import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { getAllDailyQuotas, getProfile, getScrapeQuota } from "@/lib/db";
import { requireMatchingExtensionVersion } from "@/lib/extension-version";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const versionGate = await requireMatchingExtensionVersion(request);
    if (!versionGate.ok) return versionGate.response;

    const user = await requireUser();
    if (!isUser(user)) return user;
    const scrape = await getScrapeQuota(user.id);
    const all = await getAllDailyQuotas(user.id);
    const profile = await getProfile(user.id);
    const hasResume = Boolean(String(profile?.resume_text || "").trim());
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      ...scrape,
      quotas: all,
      ready: { has_resume: hasResume },
      extension: {
        installed_version: versionGate.installed,
        required_version: versionGate.config.required_version,
        update_url: versionGate.config.update_url
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load scrape quota." },
      { status: 500 }
    );
  }
}
