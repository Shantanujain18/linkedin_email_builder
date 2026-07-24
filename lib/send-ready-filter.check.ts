/**
 * ponytail: mirrors getDraftsForSend / isUnsent — Send-all must not re-queue skipped drafts.
 * Run: npx tsx lib/send-ready-filter.check.ts
 */
function isReadyToSend(draft: { status: string; replied?: boolean }) {
  return draft.status !== "sent" && draft.status !== "skipped" && !draft.replied;
}

const samples = [
  { status: "draft", replied: false },
  { status: "failed", replied: false },
  { status: "skipped", replied: false },
  { status: "sent", replied: false },
  { status: "draft", replied: true }
];

const ready = samples.filter(isReadyToSend);
if (ready.length !== 2) {
  throw new Error(`expected 2 ready drafts, got ${ready.length}`);
}
if (ready.some((d) => d.status === "skipped" || d.status === "sent" || d.replied)) {
  throw new Error("ready set includes blocked drafts");
}

console.log("send-ready-filter.check: ok");
