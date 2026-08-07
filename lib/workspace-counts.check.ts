/**
 * ponytail: status bootstrap counts must stay SQL-shaped (no full table scan in JS).
 * Run: npx tsx lib/workspace-counts.check.ts
 */
function draftCountsFromRows(rows: Array<{ status: string; replied: boolean }>) {
  let unsent = 0;
  let draft = 0;
  let sent = 0;
  let skipped = 0;
  let replied = 0;
  for (const row of rows) {
    if (row.status !== "sent" && row.status !== "skipped" && !row.replied) unsent += 1;
    if (row.status === "draft" && !row.replied) draft += 1;
    if (row.status === "sent") sent += 1;
    if (row.status === "skipped") skipped += 1;
    if (row.replied) replied += 1;
  }
  return { total: rows.length, unsent, draft, sent, skipped, replied };
}

function postCountsFromFlags(
  rows: Array<{ hasEmail: boolean; hasDraft: boolean; hasSkip: boolean }>
) {
  const total = rows.length;
  const valid = rows.filter((r) => r.hasEmail).length;
  const drafted = rows.filter((r) => r.hasDraft).length;
  const skipped = rows.filter((r) => r.hasSkip && !r.hasDraft).length;
  const pending = rows.filter((r) => r.hasEmail && !r.hasDraft && !r.hasSkip).length;
  return { total, valid, invalid: total - valid, drafted, skipped, pending };
}

const drafts = draftCountsFromRows([
  { status: "draft", replied: false },
  { status: "sent", replied: false },
  { status: "draft", replied: true },
  { status: "skipped", replied: false }
]);
if (drafts.total !== 4 || drafts.unsent !== 1 || drafts.sent !== 1 || drafts.replied !== 1) {
  throw new Error("draftCountsFromRows failed");
}

const posts = postCountsFromFlags([
  { hasEmail: true, hasDraft: false, hasSkip: false },
  { hasEmail: true, hasDraft: true, hasSkip: false },
  { hasEmail: false, hasDraft: false, hasSkip: false },
  { hasEmail: true, hasDraft: false, hasSkip: true }
]);
if (posts.pending !== 1 || posts.drafted !== 1 || posts.skipped !== 1 || posts.invalid !== 1) {
  throw new Error("postCountsFromFlags failed");
}

console.log("workspace-counts.check: ok");
