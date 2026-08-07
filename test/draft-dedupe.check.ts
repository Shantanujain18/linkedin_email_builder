/**
 * ponytail: one draft per recipient email per day.
 * Run: npx tsx test/draft-dedupe.check.ts
 */
import { ALREADY_DRAFTED_EMAIL_TODAY, claimDraftEmail, normalizeDraftEmail } from "@/lib/draft-dedupe";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

assert(normalizeDraftEmail("  HR1@FutureTalentAdvisory.com ") === "hr1@futuretalentadvisory.com", "normalize");

const claimed = new Set<string>(["hr1@futuretalentadvisory.com"]);
assert(!claimDraftEmail("HR1@futuretalentadvisory.com", claimed), "already claimed today");
assert(claimDraftEmail("other@example.com", claimed), "first claim wins");
assert(!claimDraftEmail("other@example.com", claimed), "second same email blocked");
assert(!claimDraftEmail("", claimed), "empty email blocked");
assert(claimed.has("other@example.com"), "set updated");
assert(ALREADY_DRAFTED_EMAIL_TODAY.includes("today"), "skip reason names the day");

console.log("draft-dedupe.check.ts: ok");
