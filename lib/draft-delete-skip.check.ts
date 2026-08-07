/**
 * ponytail: deleting a draft must not return the post to Step 2 Pending.
 * Run: npx tsx lib/draft-delete-skip.check.ts
 */
function skipReasonAfterDraftDelete(status: string) {
  return status === "sent" ? "Previously sent" : "Draft deleted";
}

function wouldBePending(args: {
  hasDraft: boolean;
  hasEmail: boolean;
  draftSkipReason: string;
}) {
  if (args.hasDraft) return false;
  if (!args.hasEmail) return false;
  if (args.draftSkipReason.trim()) return false;
  return true;
}

if (skipReasonAfterDraftDelete("draft") !== "Draft deleted") throw new Error("unsent reason");
if (skipReasonAfterDraftDelete("sent") !== "Previously sent") throw new Error("sent reason");

if (
  wouldBePending({
    hasDraft: false,
    hasEmail: true,
    draftSkipReason: skipReasonAfterDraftDelete("draft")
  })
) {
  throw new Error("unsent delete still pending");
}

if (
  wouldBePending({
    hasDraft: false,
    hasEmail: true,
    draftSkipReason: skipReasonAfterDraftDelete("sent")
  })
) {
  throw new Error("sent delete still pending");
}

if (
  !wouldBePending({
    hasDraft: false,
    hasEmail: true,
    draftSkipReason: ""
  })
) {
  throw new Error("true pending should stay pending");
}

console.log("draft-delete-skip.check: ok");
