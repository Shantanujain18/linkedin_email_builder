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
  required_version: "2.4.0",
  update_url:
    "https://chromewebstore.google.com/detail/ippbibmncgbjnepmkgogdmbohfegfmid?utm_source=item-share-cb",
  message: "Please install ReachPod extension 2.4.0 from the Chrome Web Store to continue.",
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

/** Parse "2.3.0" / "2.3" into numeric parts for comparison. */
export function parseVersionParts(value: string): number[] {
  const normalized = normalizeExtensionVersion(value);
  if (!normalized) return [];
  return normalized.split(/[.+-]/).map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** True when installed >= required (semver-ish numeric compare). */
export function isVersionAtLeast(installed: string, required: string) {
  const a = parseVersionParts(installed);
  const b = parseVersionParts(required);
  if (!a.length || !b.length) return false;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
}

/** @deprecated Prefer isVersionAtLeast — kept for callers that meant exact match. */
export function versionsMatch(installed: string, required: string) {
  return isVersionAtLeast(installed, required);
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

  if (!isVersionAtLeast(installed, config.required_version)) {
    return {
      ok: false as const,
      config,
      installed,
      response: NextResponse.json(
        {
          error:
            config.message ||
            `ReachPod extension ${config.required_version} or newer is required (you have ${installed}).`,
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
