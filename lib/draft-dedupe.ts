/** Same-day recipient email claim for draft generation (mirrors send-batch claim). */

export function normalizeDraftEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

/** Returns true if this email is newly claimed for today's draft run. */
export function claimDraftEmail(email: string, claimedToday: Set<string>): boolean {
  const normalized = normalizeDraftEmail(email);
  if (!normalized) return false;
  if (claimedToday.has(normalized)) return false;
  claimedToday.add(normalized);
  return true;
}

export const ALREADY_DRAFTED_EMAIL_TODAY = "Already drafted this address today.";
