/**
 * ponytail: production-critical send batch rules.
 * Run: npm test / npx tsx test/send-batch.check.ts
 */
import {
  claimSendEmail,
  mapPool,
  prefilterDraftsForSend,
  releaseSendEmailClaim,
  remainingAfterBatch,
  selectSendWork,
  sendFetchLimit
} from "@/lib/send-batch";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

// —— fetch window ——
assert(sendFetchLimit(5) === 50, "batch 5 → fetch 50");
assert(sendFetchLimit(2) === 20, "batch 2 → fetch 20");
assert(sendFetchLimit(0) === 10, "batch 0 clamps to 1*10");
assert(sendFetchLimit(100) === 50, "fetch never exceeds 50");

// —— remaining / done (client loop safety) ——
assert(
  remainingAfterBatch({ sendAll: true, fetched: 50, fetchLimit: 50, remainingAfterSelect: 0 }) === 1,
  "full window all-handled must keep send-all looping"
);
assert(
  remainingAfterBatch({ sendAll: true, fetched: 50, fetchLimit: 50, remainingAfterSelect: 12 }) === 12,
  "in-window remainder drives remaining"
);
assert(
  remainingAfterBatch({ sendAll: true, fetched: 12, fetchLimit: 50, remainingAfterSelect: 0 }) === 0,
  "short final window is done"
);
assert(
  remainingAfterBatch({ sendAll: false, fetched: 50, fetchLimit: 50, remainingAfterSelect: 0 }) === 0,
  "draftIds path must not invent remaining"
);

// —— prefilter ——
{
  const already = new Set(["sent@today.com"]);
  const replied = new Set(["replied@x.com"]);
  const result = prefilterDraftsForSend(
    [
      { id: 1, recipientEmail: "", status: "draft" },
      { id: 2, recipientEmail: "  Replied@X.com ", status: "draft", replied: false },
      { id: 3, recipientEmail: "sent@today.com", status: "draft" },
      { id: 4, recipientEmail: "ok@x.com", status: "draft" },
      { id: 5, recipientEmail: "ok2@x.com", status: "draft", replied: true },
      { id: 6, recipientEmail: "ok3@x.com", status: "sent" } // missing email path won't apply; alreadyToday won't; eligible if not replied
    ],
    already,
    replied
  );
  assert(result.eligible.map((d) => d.id).join(",") === "4,6", `eligible=${result.eligible.map((d) => d.id)}`);
  assert(result.skipIds.includes(1) && result.skipIds.includes(2) && result.skipIds.includes(3), "skip ids");
  assert(!result.skipIds.includes(6), "already-sent status should not be re-marked skipped");
  assert(result.preSkipped.length === 4, "four pre-skipped including replied flag");
}

// —— work selection: quota + dedupe ——
{
  const eligible = [
    { id: 1, recipientEmail: "a@x.com", status: "draft" },
    { id: 2, recipientEmail: "A@x.com", status: "draft" }, // dup
    { id: 3, recipientEmail: "b@x.com", status: "draft" },
    { id: 4, recipientEmail: "c@x.com", status: "draft" },
    { id: 5, recipientEmail: "d@x.com", status: "draft" }
  ];
  const { work, remainingAfterSelect } = selectSendWork(eligible, 5, 3);
  assert(work.map((d) => d.id).join(",") === "1,3,4", `work=${work.map((d) => d.id)}`);
  assert(work.length === 3, "quota caps work");
  assert(remainingAfterSelect === 2, "dup + leftover count toward remainingAfterSelect");
}

{
  const { work } = selectSendWork(
    [{ id: 1, recipientEmail: "a@x.com", status: "draft" }],
    5,
    0
  );
  assert(work.length === 0, "zero quota → empty work");
}

// —— claim / release for parallel safety ——
{
  const already = new Set<string>();
  const run = new Set<string>();
  assert(claimSendEmail("A@x.com", already, run) === "ok", "first claim");
  assert(claimSendEmail("a@x.com", already, run) === "duplicate", "second claim blocked");
  releaseSendEmailClaim("A@x.com", already, run);
  assert(claimSendEmail("a@x.com", already, run) === "ok", "after release claim works");
}

// —— mapPool preserves order + concurrency ——
async function runAsyncChecks() {
  const started: number[] = [];
  const results = await mapPool([1, 2, 3, 4], 2, async (n) => {
    started.push(n);
    await new Promise((r) => setTimeout(r, 5));
    return n * 10;
  });
  assert(results.join(",") === "10,20,30,40", "mapPool preserves index order");
  assert(started.length === 4, "all items ran");

  const empty = await mapPool([], 2, async (n: number) => n);
  assert(empty.length === 0, "empty mapPool");

  // —— simulated parallel claim race on same email (defensive) ——
  const already = new Set<string>();
  const run = new Set<string>();
  const outcomes = await mapPool(
    [
      { id: 1, email: "same@x.com" },
      { id: 2, email: "same@x.com" }
    ],
    2,
    async (item) => {
      if (claimSendEmail(item.email, already, run) !== "ok") {
        return { id: item.id, kind: "skipped" as const };
      }
      await new Promise((r) => setTimeout(r, 1));
      return { id: item.id, kind: "sent" as const };
    }
  );
  const sent = outcomes.filter((o) => o.kind === "sent");
  const skipped = outcomes.filter((o) => o.kind === "skipped");
  assert(sent.length === 1 && skipped.length === 1, "only one parallel send per email");
}

runAsyncChecks()
  .then(() => {
    console.log("send-batch.check: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
