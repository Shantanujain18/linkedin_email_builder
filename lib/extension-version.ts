import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/postgres";
import { extensionConfig } from "@/lib/schema";

export const EXTENSION_VERSION_HEADER = "x-reachpod-extension-version";

export type ExtensionConfigRow = {
  required_version: string;
  update_url: string;
  message: string;
  updated_at: string;
};

const DEFAULT_CONFIG: ExtensionConfigRow = {
  required_version: "2.2.0",
  update_url: "https://github.com/Shantanujain18/linkedin_post_scrapper/raw/main/dist.zip",
  message: "Please install ReachPod extension 2.2.0 to continue.",
  updated_at: new Date(0).toISOString()
};

export async function getExtensionConfig(): Promise<ExtensionConfigRow> {
  const [row] = await getDb()
    .select()
    .from(extensionConfig)
    .where(eq(extensionConfig.id, 1))
    .limit(1);

  if (!row) return DEFAULT_CONFIG;

  return {
    required_version: row.requiredVersion,
    update_url: row.updateUrl,
    message: row.message,
    updated_at: row.updatedAt
  };
}

export function normalizeExtensionVersion(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

export function versionsMatch(installed: string, required: string) {
  return normalizeExtensionVersion(installed) === normalizeExtensionVersion(required);
}

export function extensionVersionFromRequest(request: Request) {
  return normalizeExtensionVersion(request.headers.get(EXTENSION_VERSION_HEADER));
}

export async function requireMatchingExtensionVersion(request: Request) {
  const config = await getExtensionConfig();
  const installed = extensionVersionFromRequest(request);

  if (!installed) {
    return {
      ok: false as const,
      config,
      installed: "",
      response: NextResponse.json(
        {
          error: "Extension version is required. Update ReachPod and try again.",
          code: "EXTENSION_VERSION_REQUIRED",
          required_version: config.required_version,
          update_url: config.update_url,
          message: config.message
        },
        { status: 426 }
      )
    };
  }

  if (!versionsMatch(installed, config.required_version)) {
    return {
      ok: false as const,
      config,
      installed,
      response: NextResponse.json(
        {
          error:
            config.message ||
            `ReachPod extension ${config.required_version} is required (you have ${installed}).`,
          code: "EXTENSION_VERSION_MISMATCH",
          required_version: config.required_version,
          installed_version: installed,
          update_url: config.update_url,
          message: config.message
        },
        { status: 426 }
      )
    };
  }

  return { ok: true as const, config, installed };
}
