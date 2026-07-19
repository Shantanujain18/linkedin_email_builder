import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { refundScrapeQuota, reserveScrapeQuota } from "@/lib/db";
import { requireMatchingExtensionVersion } from "@/lib/extension-version";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const versionGate = await requireMatchingExtensionVersion(request);
    if (!versionGate.ok) return versionGate.response;

    const user = await requireUser();
    if (!isUser(user)) return user;

    const body = (await request.json().catch(() => ({}))) as {
      requested?: number;
      unused?: number;
      action?: "reserve" | "refund";
    };

    const action = body.action === "refund" ? "refund" : "reserve";

    if (action === "refund") {
      const unused = Math.max(0, Math.floor(Number(body.unused) || 0));
      const quota = await refundScrapeQuota(user.id, unused);
      return NextResponse.json({ ...quota, refunded: unused });
    }

    const requested = Math.max(0, Math.floor(Number(body.requested) || 0));
    if (!requested) {
      return NextResponse.json({ error: "requested must be a positive integer." }, { status: 400 });
    }

    const result = await reserveScrapeQuota(user.id, requested);
    if (!result.allowed) {
      return NextResponse.json(
        {
          error: `Daily post limit reached (${result.daily_post_limit}/day on the ${result.plan} plan).`,
          ...result
        },
        { status: 429 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape quota update failed." },
      { status: 500 }
    );
  }
}
