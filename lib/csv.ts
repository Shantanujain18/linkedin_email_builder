import { parse } from "csv-parse/sync";

const aliases: Record<string, string[]> = {
  postedBy: ["posted_by", "posted by", "author", "name"],
  postedByUrl: ["posted_by_url", "posted by url", "posted by url link", "profile_url"],
  postedDate: ["posted_date", "posted date", "date"],
  postedContent: ["posted_content", "posted content", "content", "text", "body"],
  postUrl: ["post_url", "post url", "url"]
};

function value(row: Record<string, string>, keys: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, val]) => [key.trim().toLowerCase(), val]));
  for (const key of keys) if (normalized[key]) return normalized[key].trim();
  return "";
}

export function extractEmails(text: string) {
  return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((email) => email.toLowerCase()))];
}

/** Pull phone-like numbers from post text (same scrape path as emails). */
export function extractPhones(text: string) {
  const matches = String(text || "").match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}(?:[\s.-]?\d{3,5})?/g
  ) || [];
  return [
    ...new Set(
      matches
        .map((value) => value.trim().replace(/\s+/g, " "))
        .filter((value) => (value.match(/\d/g) || []).length >= 10)
        .filter((value) => (value.match(/\d/g) || []).length <= 15)
    )
  ];
}

export function parseLinkedInCsv(csvText: string) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  return rows.map((row) => {
    const postedContent = value(row, aliases.postedContent);
    const blob = Object.values(row).join("\n");
    return {
      postedBy: value(row, aliases.postedBy), postedByUrl: value(row, aliases.postedByUrl),
      postedDate: value(row, aliases.postedDate), postedContent, postUrl: value(row, aliases.postUrl),
      emails: extractEmails(blob),
      phones: extractPhones(blob)
    };
  });
}

export function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
