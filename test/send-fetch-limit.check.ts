/**
 * ponytail: send-all fetch window + remaining/done when backlog exceeds the cap.
 * Run: npm test / npx tsx test/send-fetch-limit.check.ts
 */
import { remainingAfterBatch, sendFetchLimit } from "@/lib/send-batch";

if (sendFetchLimit(5) !== 50) throw new Error("fetchLimit for batch 5");
if (sendFetchLimit(2) !== 20) throw new Error("fetchLimit for batch 2");

if (remainingAfterBatch({ sendAll: true, fetched: 50, fetchLimit: 50, remainingAfterSelect: 0 }) !== 1) {
  throw new Error("full window all-skipped should keep client looping");
}
if (remainingAfterBatch({ sendAll: true, fetched: 50, fetchLimit: 50, remainingAfterSelect: 12 }) !== 12) {
  throw new Error("partial eligible remaining");
}
if (remainingAfterBatch({ sendAll: true, fetched: 12, fetchLimit: 50, remainingAfterSelect: 0 }) !== 0) {
  throw new Error("short final window should be done");
}
if (remainingAfterBatch({ sendAll: false, fetched: 50, fetchLimit: 50, remainingAfterSelect: 0 }) !== 0) {
  throw new Error("draftIds path should not invent remaining");
}

console.log("send-fetch-limit.check: ok");
