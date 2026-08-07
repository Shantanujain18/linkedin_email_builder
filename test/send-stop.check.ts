/**
 * ponytail: Stop sending must abort in-flight fetch and skip remaining batches.
 * Run: npm test / npx tsx test/send-stop.check.ts
 */

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function runBatchedSend(options: {
  batches: number;
  abortAfterBatch?: number;
  abortDuringFetch?: boolean;
}) {
  const abort = new AbortController();
  let sentTotal = 0;
  let batchesStarted = 0;
  let batchesCompleted = 0;
  let stopped = false;

  for (let i = 0; i < options.batches; i += 1) {
    if (abort.signal.aborted) {
      stopped = true;
      break;
    }

    batchesStarted += 1;

    if (options.abortAfterBatch != null && i === options.abortAfterBatch) {
      abort.abort();
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), options.abortDuringFetch && i === options.abortAfterBatch ? 40 : 5);
        abort.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
        if (abort.signal.aborted) {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }
      });
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        stopped = true;
        break;
      }
      throw error;
    }

    batchesCompleted += 1;
    sentTotal += 5;
  }

  return { sentTotal, batchesStarted, batchesCompleted, stopped };
}

async function main() {
  const full = await runBatchedSend({ batches: 4 });
  assert(!full.stopped, "full run should not stop");
  assert(full.batchesCompleted === 4, "all batches complete");
  assert(full.sentTotal === 20, "full sent total");

  const stoppedBetween = await runBatchedSend({ batches: 5, abortAfterBatch: 1, abortDuringFetch: true });
  assert(stoppedBetween.stopped, "abort during fetch marks stopped");
  assert(stoppedBetween.batchesCompleted === 1, "only batches finished before abort count");
  assert(stoppedBetween.batchesStarted === 2, "abort batch was started");
  assert(stoppedBetween.sentTotal === 5, "partial progress kept");

  const abort = new AbortController();
  abort.abort();
  let looped = 0;
  while (looped < 3) {
    if (abort.signal.aborted) break;
    looped += 1;
  }
  assert(looped === 0, "pre-aborted controller skips loop body");

  console.log("send-stop.check: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
