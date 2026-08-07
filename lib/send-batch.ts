/**
 * Pure send-batch helpers (shared by /api/send and checks).
 * Keep side-effect-free so production rules can be asserted without SMTP/DB.
 */

export function sendFetchLimit(batchLimit: number) {
  return Math.min(50, Math.max(1, batchLimit) * 10);
}

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export type SendDraftRow = {
  id: number;
  recipientEmail: string;
  subject?: string;
  body?: string;
  status: string;
  replied?: boolean;
};

export type PrefilterResult = {
  eligible: SendDraftRow[];
  skipIds: number[];
  preSkipped: Array<{ id: number; status: string; email?: string }>;
  preSkippedDrafts: Array<{ id: number; email: string; reason: string }>;
};

/** Mirror /api/send prefilter — set lookups only (no per-row DB). */
export function prefilterDraftsForSend(
  drafts: SendDraftRow[],
  alreadyToday: Set<string>,
  repliedEmails: Set<string>
): PrefilterResult {
  const eligible: SendDraftRow[] = [];
  const skipIds: number[] = [];
  const preSkipped: Array<{ id: number; status: string; email?: string }> = [];
  const preSkippedDrafts: Array<{ id: number; email: string; reason: string }> = [];

  for (const draft of drafts) {
    const email = normalizeEmail(draft.recipientEmail);
    if (!email) {
      if (draft.status !== "sent") skipIds.push(draft.id);
      preSkippedDrafts.push({
        id: draft.id,
        email: draft.recipientEmail,
        reason: "Missing recipient email."
      });
      preSkipped.push({ id: draft.id, status: "skipped", email: draft.recipientEmail });
      continue;
    }
    if (draft.replied || repliedEmails.has(email)) {
      if (draft.status !== "sent") skipIds.push(draft.id);
      preSkippedDrafts.push({
        id: draft.id,
        email,
        reason: "Recipient marked as replied — automation blocked."
      });
      preSkipped.push({ id: draft.id, status: "skipped", email });
      continue;
    }
    if (alreadyToday.has(email)) {
      if (draft.status !== "sent") skipIds.push(draft.id);
      preSkippedDrafts.push({
        id: draft.id,
        email,
        reason: "Already emailed this address today."
      });
      preSkipped.push({ id: draft.id, status: "skipped", email });
      continue;
    }
    eligible.push(draft);
  }

  return { eligible, skipIds, preSkipped, preSkippedDrafts };
}

/** Cap by quota/batch and dedupe email so parallel workers never double-send. */
export function selectSendWork(
  eligible: SendDraftRow[],
  batchLimit: number,
  quotaRemaining: number
): { work: SendDraftRow[]; remainingAfterSelect: number } {
  const work: SendDraftRow[] = [];
  const seenEmails = new Set<string>();
  const quotaCap = Math.min(Math.max(0, batchLimit), Math.max(0, quotaRemaining));
  for (const draft of eligible) {
    if (work.length >= quotaCap) break;
    const email = normalizeEmail(draft.recipientEmail);
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);
    work.push(draft);
  }
  return {
    work,
    remainingAfterSelect: Math.max(0, eligible.length - work.length)
  };
}

export function remainingAfterBatch(options: {
  sendAll: boolean;
  fetched: number;
  fetchLimit: number;
  remainingAfterSelect: number;
}) {
  const maybeMore = options.sendAll && options.fetched >= options.fetchLimit;
  return options.remainingAfterSelect + (maybeMore && options.remainingAfterSelect === 0 ? 1 : 0);
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length || 1)) },
    () => worker()
  );
  if (!items.length) return [];
  await Promise.all(workers);
  return results;
}

/**
 * Claim emails synchronously before awaiting SMTP so concurrent workers
 * cannot send twice to the same address even if work dedupe failed.
 */
export function claimSendEmail(
  email: string,
  alreadyToday: Set<string>,
  sentThisRun: Set<string>
): "ok" | "duplicate" {
  const normalized = normalizeEmail(email);
  if (!normalized) return "duplicate";
  if (alreadyToday.has(normalized) || sentThisRun.has(normalized)) return "duplicate";
  sentThisRun.add(normalized);
  alreadyToday.add(normalized);
  return "ok";
}

export function releaseSendEmailClaim(
  email: string,
  alreadyToday: Set<string>,
  sentThisRun: Set<string>
) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  sentThisRun.delete(normalized);
  alreadyToday.delete(normalized);
}
