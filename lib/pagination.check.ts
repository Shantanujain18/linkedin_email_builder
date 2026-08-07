/**
 * ponytail: page helpers used by posts/drafts list APIs.
 * Run: npx tsx lib/pagination.check.ts
 */
function parsePageSize(raw: unknown, fallback: 10 | 25 | 50 | 100 = 25): 10 | 25 | 50 | 100 {
  const n = Number(raw);
  if (n === 10 || n === 25 || n === 50 || n === 100) return n;
  return fallback;
}

function parsePage(raw: unknown, fallback = 1) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function slicePage<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page: safePage };
}

function sortBySentThenCreated(
  rows: Array<{ sent_at?: string; created_at?: string }>
) {
  return [...rows].sort((a, b) => {
    const aSent = String(a.sent_at || "");
    const bSent = String(b.sent_at || "");
    if (aSent !== bSent) {
      if (!aSent) return 1;
      if (!bSent) return -1;
      return bSent.localeCompare(aSent);
    }
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

if (parsePageSize("10") !== 10) throw new Error("pageSize 10");
if (parsePageSize("50") !== 50) throw new Error("pageSize 50");
if (parsePageSize("7") !== 25) throw new Error("pageSize fallback");
if (parsePage("0") !== 1) throw new Error("page min");
if (parsePage("3") !== 3) throw new Error("page 3");

const sliced = slicePage([1, 2, 3, 4, 5], 2, 2);
if (sliced.page !== 2 || sliced.items.join(",") !== "3,4" || sliced.total !== 5) {
  throw new Error("slicePage failed");
}

const sorted = sortBySentThenCreated([
  { sent_at: "", created_at: "2026-01-02" },
  { sent_at: "2026-02-01", created_at: "2026-01-01" },
  { sent_at: "2026-03-01", created_at: "2026-01-03" }
]);
if (sorted[0].sent_at !== "2026-03-01" || sorted[2].sent_at !== "") {
  throw new Error("sortBySentThenCreated failed");
}

console.log("pagination.check: ok");
