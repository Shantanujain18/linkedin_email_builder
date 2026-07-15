import OpenAI from "openai";
import type { CandidateProfile } from "./types";

export const ROLE_KEYWORDS = [
  "Backend Engineer", "Backend Developer", "Software Engineer", "SDET",
  "Automation Lead", "Python Developer", "Python Architect", "Python Lead",
  "AI Trainee", "Game Developer", "Data Engineer", "Full Stack Developer",
  "DevOps Engineer", "ML Engineer", "AI Engineer", "Data Scientist",
  "QA Engineer", "Team Lead"
];

let openai: OpenAI | null = null;

function client() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to email_sender/.env.local.");
  }
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function model() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function jsonFromResponse(content: string | null | undefined) {
  const cleaned = (content || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join(", ");
  return String(value);
}

function toCandidateProfile(raw: Record<string, unknown>): CandidateProfile {
  return {
    name: asString(raw.name),
    yoe: asString(raw.yoe),
    top_skills: asString(raw.top_skills),
    current_role: asString(raw.current_role),
    resume_link: asString(raw.resume_link),
    phone: asString(raw.phone),
    email: asString(raw.email)
  };
}

function compactProfile(profile: CandidateProfile) {
  return {
    name: profile.name,
    yoe: profile.yoe,
    top_skills: profile.top_skills,
    current_role: profile.current_role,
    phone: profile.phone,
    email: profile.email,
    immediate_joiner: Boolean(profile.immediate_joiner)
  };
}

function draftSystemPrompt(batch: boolean) {
  const base = batch
    ? `Write concise professional job-application outreach emails (under 140 words each). Return only JSON: {"drafts":[{"key":"...","subject":"...","body":"..."}]}. Include exactly one object per input key.`
    : `Write a concise professional job-application outreach email (under 140 words). Return only JSON with string keys subject and body.`;
  return `${base} Never invent experience. Mention a role only if the post supports it. If candidate.immediate_joiner is true, clearly mention availability to join immediately / can join immediately when it fits naturally. If false, do not claim immediate joining. Role keywords: ${ROLE_KEYWORDS.join(", ")}.`;
}

export async function extractCandidateProfile(resumeText: string): Promise<CandidateProfile> {
  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Extract a candidate profile from a resume. Return only valid JSON with exactly these string keys: name, yoe, top_skills, current_role, resume_link, phone, email. Use empty strings when unknown. top_skills must be a single comma-separated string, never an array. yoe must be a string."
      },
      { role: "user", content: resumeText.slice(0, 60_000) }
    ]
  });
  return toCandidateProfile(jsonFromResponse(response.choices[0]?.message.content));
}

export async function draftEmail(profile: CandidateProfile, post: { postedBy: string; content: string; email: string }) {
  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.4,
    max_tokens: 450,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: draftSystemPrompt(false) },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          recipient: post.postedBy,
          job_post: post.content.slice(0, 1800),
          recipient_email: post.email
        })
      }
    ]
  });
  const parsed = jsonFromResponse(response.choices[0]?.message.content) as { subject?: unknown; body?: unknown };
  return { subject: asString(parsed.subject), body: asString(parsed.body) };
}

/** Generate several personalized drafts in one model call. */
export async function draftEmailBatch(
  profile: CandidateProfile,
  posts: Array<{ key: string; postedBy: string; content: string; email: string }>
): Promise<Record<string, { subject: string; body: string }>> {
  if (!posts.length) return {};
  if (posts.length === 1) {
    const one = await draftEmail(profile, posts[0]);
    return { [posts[0].key]: one };
  }

  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.4,
    max_tokens: Math.min(350 * posts.length, 2500),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: draftSystemPrompt(true) },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          posts: posts.map((post) => ({
            key: post.key,
            recipient: post.postedBy,
            job_post: post.content.slice(0, 1200),
            recipient_email: post.email
          }))
        })
      }
    ]
  });

  const parsed = jsonFromResponse(response.choices[0]?.message.content) as { drafts?: unknown };
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
  const byKey: Record<string, { subject: string; body: string }> = {};

  for (const item of drafts) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = asString(row.key);
    if (!key) continue;
    byKey[key] = { subject: asString(row.subject), body: asString(row.body) };
  }

  // Fill any missing keys with individual calls so generation still completes.
  const missing = posts.filter((post) => !byKey[post.key]?.subject || !byKey[post.key]?.body);
  if (missing.length) {
    const fallbacks = await Promise.all(missing.map(async (post) => [post.key, await draftEmail(profile, post)] as const));
    for (const [key, value] of fallbacks) byKey[key] = value;
  }

  return byKey;
}
