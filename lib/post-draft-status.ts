import { evaluateSkillFit } from "@/lib/skills";

export type PostFilter = "all" | "valid" | "invalid" | "drafted" | "skipped" | "pending";

export type PostDraftOutcome = {
  kind: "drafted" | "none" | "skipped" | "pending";
  label: string;
  reason: string;
};

function parsePostEmails(emailsJson: unknown): string[] {
  try {
    const parsed = JSON.parse(String(emailsJson || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((email) => String(email || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function postDraftStatus(
  post: { id?: number | string; emails_json?: unknown; draft_skip_reason?: unknown; posted_content?: unknown },
  draftedPostIds: Set<number>,
  topSkills: string
): PostDraftOutcome {
  if (draftedPostIds.has(Number(post.id))) {
    return { kind: "drafted", label: "Drafted", reason: "" };
  }
  const emails = parsePostEmails(post.emails_json);
  if (!emails.length) {
    return { kind: "none", label: "—", reason: "No email in post" };
  }
  const storedSkip = String(post.draft_skip_reason || "").trim();
  if (storedSkip) {
    return { kind: "skipped", label: "Skipped", reason: storedSkip };
  }
  const fit = evaluateSkillFit(topSkills, String(post.posted_content || ""));
  if (!fit.ok) {
    return { kind: "skipped", label: "Skipped", reason: fit.reason };
  }
  return {
    kind: "pending",
    label: "Pending",
    reason: "Skill match OK — use Write email on this row, or Write pending emails for all."
  };
}

export function postSortRank(outcome: { kind: string } | undefined, valid: boolean) {
  if (outcome?.kind === "pending") return 0;
  if (outcome?.kind === "drafted") return 1;
  if (valid && outcome?.kind === "skipped") return 2;
  if (valid) return 3;
  return 4;
}

export function parsePageSize(raw: unknown, fallback: 10 | 25 | 50 | 100 = 25): 10 | 25 | 50 | 100 {
  const n = Number(raw);
  if (n === 10 || n === 25 || n === 50 || n === 100) return n;
  return fallback;
}

export function parsePage(raw: unknown, fallback = 1) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

export function toLocalDay(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
