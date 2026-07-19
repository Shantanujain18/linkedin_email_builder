import { NextResponse } from "next/server";
import { getExtensionConfig } from "@/lib/extension-version";

export const runtime = "nodejs";

/** Public — extension checks required version + update link before scraping. */
export async function GET() {
  try {
    const config = await getExtensionConfig();
    return NextResponse.json({
      required_version: config.required_version,
      update_url: config.update_url,
      message: config.message,
      updated_at: config.updated_at
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load extension version." },
      { status: 500 }
    );
  }
}
