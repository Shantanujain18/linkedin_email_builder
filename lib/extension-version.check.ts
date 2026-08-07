/**
 * ponytail: extension version gate must accept newer installs (semver >=).
 * Run: npx tsx lib/extension-version.check.ts
 */
function normalizeExtensionVersion(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

function parseVersionParts(value: string): number[] {
  const normalized = normalizeExtensionVersion(value);
  if (!normalized) return [];
  return normalized.split(/[.+-]/).map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function isVersionAtLeast(installed: string, required: string) {
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

if (!isVersionAtLeast("2.3.0", "2.2.0")) throw new Error("2.3 >= 2.2");
if (!isVersionAtLeast("2.2.0", "2.2.0")) throw new Error("equal ok");
if (!isVersionAtLeast("2.3.1", "2.3.0")) throw new Error("patch newer");
if (isVersionAtLeast("2.1.9", "2.2.0")) throw new Error("older should fail");
if (isVersionAtLeast("", "2.2.0")) throw new Error("empty should fail");
if (!isVersionAtLeast("v2.4", "2.3.0")) throw new Error("v prefix + shorter");

console.log("extension-version.check: ok");
