import OpenAI from "openai";
import type { CandidateProfile } from "./types";
import { evaluateSkillFit, parseSkills } from "./skills";

export const ROLE_KEYWORDS = [
  "Backend Engineer", "Backend Developer", "Software Engineer", "SDET",
  "Automation Lead", "Python Developer", "Python Architect", "Python Lead",
  "AI Trainee", "Game Developer", "Data Engineer", "Full Stack Developer",
  "DevOps Engineer", "ML Engineer", "AI Engineer", "Data Scientist",
  "QA Engineer", "Team Lead"
];

export type DraftResult =
  | {
      skip: false;
      subject: string;
      body: string;
      matched_skills: string[];
      phone: string;
      location: string;
      company: string;
      contact_name: string;
      hiring_summary: string;
      talking_points: string;
    }
  | { skip: true; reason: string };

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
  const skills = parseSkills(profile.top_skills);
  return {
    name: profile.name,
    yoe: profile.yoe,
    skills,
    top_skills: skills.join(", "),
    current_role: profile.current_role,
    phone: profile.phone,
    email: profile.email,
    immediate_joiner: Boolean(profile.immediate_joiner)
  };
}

function draftSystemPrompt(batch: boolean, forceWrite = false) {
  const shape = batch
    ? `Return only JSON: {"drafts":[...one object per input key...]}. Each object is either {"key":"...","skip":true,"reason":"..."} OR {"key":"...","skip":false,"matched_skills":["..."],"phone":"...","location":"...","company":"...","contact_name":"...","hiring_summary":"...","talking_points":["...","..."],"subject":"...","body":"..."}.`
    : `Return only JSON that is either {"skip":true,"reason":"..."} OR {"skip":false,"matched_skills":["..."],"phone":"...","location":"...","company":"...","contact_name":"...","hiring_summary":"...","talking_points":["...","..."],"subject":"...","body":"..."}.`;

  if (forceWrite) {
    return [
      "You write concise professional job-application outreach emails (under 140 words) and extract recruiter/job details from the post.",
      shape,
      "CRITICAL: The application already verified skill fit. matched_skills in the input are confirmed overlaps.",
      "You MUST return skip:false with a complete subject and body. Do NOT skip for skills, experience years, notice period, location, or contract type.",
      "Emphasize ONLY the matched skills. Never invent experience.",
      "If candidate.immediate_joiner is true, mention immediate joining availability naturally. If false, do not claim it.",
      "Extraction: phone, location, company, contact_name, hiring_summary, talking_points (3-5 short points as a string array).",
      `Possible role keywords when relevant: ${ROLE_KEYWORDS.join(", ")}.`
    ].join(" ");
  }

  return [
    "You write concise professional job-application outreach emails (under 140 words) only when the candidate is a genuine skill fit, and you also extract recruiter/job details from the post.",
    shape,
    "Skill-fit rules (strict):",
    "1. Read the full job post. Identify the required/primary technologies and role.",
    "2. Compare against candidate.skills. Prefer the strongest overlapping skills.",
    "3. If skill_fit_hint.matched_skills is non-empty, treat skill fit as already verified and do NOT skip for skill reasons.",
    "4. SKIP only if skill_fit_hint.matched_skills is empty AND the post centers on a stack the candidate does not have (example: Angular role when candidate skills are React/Python/Django).",
    "5. React is NOT interchangeable with Angular or Vue. Django/Python is NOT interchangeable with Java/.NET unless the post clearly wants Python too.",
    "6. Never write 'although I do not have X' or offer to learn a missing primary stack. If primary stack is missing and matched_skills is empty, skip.",
    "7. When fit is true, emphasize ONLY matched skills and relevant experience. Do not list unrelated skills as if they qualify for the role.",
    "8. Never invent experience. Mention a target role title only if the post supports it.",
    "9. Do not skip solely because years of experience, notice period, or employment type differ.",
    "10. If candidate.immediate_joiner is true, mention immediate joining availability naturally. If false, do not claim it.",
    "Extraction rules for fit=true drafts:",
    "11. phone: extract recruiter/mobile numbers from the post (include country code if present). Use empty string if none. Never invent a number.",
    "12. location: city/remote/hybrid if stated, else empty string.",
    "13. company: hiring company or agency name if present, else empty string.",
    "14. contact_name: HR/recruiter/poster name if present (may use recipient), else empty string.",
    "15. hiring_summary: 1-2 sentence summary of what they are hiring for.",
    "16. talking_points: 3-5 short call talking points tailored to matched skills and the role (array of strings).",
    `Possible role keywords when relevant: ${ROLE_KEYWORDS.join(", ")}.`
  ].join(" ");
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\n|•|- /)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toDraftResult(raw: Record<string, unknown>): DraftResult {
  if (raw.skip === true || raw.fit === false) {
    return { skip: true, reason: asString(raw.reason) || "Not a strong skill match for this post." };
  }
  const subject = asString(raw.subject);
  const body = asString(raw.body);
  if (!subject || !body) {
    return { skip: true, reason: asString(raw.reason) || "Model returned an incomplete draft." };
  }
  const matched = Array.isArray(raw.matched_skills)
    ? raw.matched_skills.map(asString).filter(Boolean)
    : [];
  const talkingPoints = asStringList(raw.talking_points);
  return {
    skip: false,
    subject,
    body,
    matched_skills: matched,
    phone: asString(raw.phone),
    location: asString(raw.location),
    company: asString(raw.company),
    contact_name: asString(raw.contact_name),
    hiring_summary: asString(raw.hiring_summary),
    talking_points: talkingPoints.join("\n")
  };
}

export async function extractCandidateProfile(resumeText: string): Promise<CandidateProfile> {
  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract a candidate profile from a resume. Return only valid JSON with exactly these string keys: name, yoe, top_skills, current_role, resume_link, phone, email. Use empty strings when unknown. top_skills must be a single comma-separated string, never an array. yoe must be a string."
      },
      { role: "user", content: resumeText.slice(0, 60_000) }
    ]
  });
  return toCandidateProfile(jsonFromResponse(response.choices[0]?.message.content));
}

async function requestDraft(
  profile: CandidateProfile,
  post: { postedBy: string; content: string; email: string },
  fit: ReturnType<typeof evaluateSkillFit>,
  forceWrite: boolean
): Promise<DraftResult> {
  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.3,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: draftSystemPrompt(false, forceWrite) },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          skill_fit_hint: {
            matched_skills: fit.matchedSkills,
            post_technologies: fit.postTechs,
            verified: true
          },
          recipient: post.postedBy,
          job_post: post.content.slice(0, 4000),
          recipient_email: post.email
        })
      }
    ]
  });
  return toDraftResult(jsonFromResponse(response.choices[0]?.message.content) as Record<string, unknown>);
}

export async function draftEmail(
  profile: CandidateProfile,
  post: { postedBy: string; content: string; email: string }
): Promise<DraftResult> {
  const fit = evaluateSkillFit(profile.top_skills, post.content);
  if (!fit.ok) return { skip: true, reason: fit.reason };

  let result = await requestDraft(profile, post, fit, false);
  // Local matcher already confirmed overlap — don't let the model falsely veto on "skills".
  if (result.skip && fit.matchedSkills.length > 0) {
    result = await requestDraft(profile, post, fit, true);
  }
  return result;
}

/** Generate several personalized drafts in one model call. */
export async function draftEmailBatch(
  profile: CandidateProfile,
  posts: Array<{ key: string; postedBy: string; content: string; email: string }>
): Promise<Record<string, DraftResult>> {
  if (!posts.length) return {};

  const results: Record<string, DraftResult> = {};
  const eligible: typeof posts = [];

  for (const post of posts) {
    const fit = evaluateSkillFit(profile.top_skills, post.content);
    if (!fit.ok) {
      results[post.key] = { skip: true, reason: fit.reason };
    } else {
      eligible.push(post);
    }
  }

  if (!eligible.length) return results;

  if (eligible.length === 1) {
    results[eligible[0].key] = await draftEmail(profile, eligible[0]);
    return results;
  }

  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.3,
    max_tokens: Math.min(700 * eligible.length, 4000),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: draftSystemPrompt(true) },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          posts: eligible.map((post) => {
            const fit = evaluateSkillFit(profile.top_skills, post.content);
            return {
              key: post.key,
              recipient: post.postedBy,
              job_post: post.content.slice(0, 2800),
              recipient_email: post.email,
              skill_fit_hint: {
                matched_skills: fit.matchedSkills,
                post_technologies: fit.postTechs
              }
            };
          })
        })
      }
    ]
  });

  const parsed = jsonFromResponse(response.choices[0]?.message.content) as { drafts?: unknown };
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];

  for (const item of drafts) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = asString(row.key);
    if (!key) continue;
    results[key] = toDraftResult(row);
  }

  const missing = eligible.filter((post) => results[post.key] == null);
  if (missing.length) {
    const fallbacks = await Promise.all(missing.map(async (post) => [post.key, await draftEmail(profile, post)] as const));
    for (const [key, value] of fallbacks) results[key] = value;
  }

  // Model sometimes falsely skips eligible posts — retry those via draftEmail (force path).
  const falseSkips = eligible.filter((post) => results[post.key]?.skip);
  if (falseSkips.length) {
    const retries = await Promise.all(falseSkips.map(async (post) => [post.key, await draftEmail(profile, post)] as const));
    for (const [key, value] of retries) results[key] = value;
  }

  return results;
}

export type EnrichmentResult = {
  phone: string;
  location: string;
  company: string;
  contact_name: string;
  hiring_summary: string;
  talking_points: string;
  matched_skills: string[];
};

function toEnrichmentResult(raw: Record<string, unknown>): EnrichmentResult {
  return {
    phone: asString(raw.phone),
    location: asString(raw.location),
    company: asString(raw.company),
    contact_name: asString(raw.contact_name),
    hiring_summary: asString(raw.hiring_summary),
    talking_points: asStringList(raw.talking_points).join("\n"),
    matched_skills: Array.isArray(raw.matched_skills)
      ? raw.matched_skills.map(asString).filter(Boolean)
      : asStringList(raw.matched_skills)
  };
}

const ENRICH_SYSTEM = [
  "Extract recruiter and hiring details from a LinkedIn job post for an existing outreach draft.",
  "Return only JSON with keys: phone, location, company, contact_name, hiring_summary, talking_points (array of 3-5 short strings), matched_skills (array).",
  "Use empty strings/arrays when unknown. Never invent phone numbers, company names, or contact names.",
  "phone: recruiter/mobile numbers with country code if present.",
  "location: city/remote/hybrid if stated.",
  "company: hiring company or agency if present.",
  "contact_name: HR/recruiter/poster name if present.",
  "hiring_summary: 1-2 sentence summary of what they are hiring for.",
  "talking_points: tailored to candidate.skills and the role.",
  "matched_skills: subset of candidate.skills that actually appear relevant to this post."
].join(" ");

/** Backfill recruiter/job metadata for an existing draft without rewriting the email. */
export async function enrichDraftFromPost(
  profile: CandidateProfile,
  post: { postedBy: string; content: string; email?: string }
): Promise<EnrichmentResult> {
  const fit = evaluateSkillFit(profile.top_skills, post.content);
  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ENRICH_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          skill_fit_hint: {
            matched_skills: fit.matchedSkills,
            post_technologies: fit.postTechs
          },
          recipient: post.postedBy,
          recipient_email: post.email || "",
          job_post: post.content.slice(0, 4000)
        })
      }
    ]
  });
  const parsed = toEnrichmentResult(jsonFromResponse(response.choices[0]?.message.content) as Record<string, unknown>);
  if (!parsed.matched_skills.length && fit.matchedSkills.length) {
    parsed.matched_skills = fit.matchedSkills;
  }
  if (!parsed.contact_name && post.postedBy) parsed.contact_name = post.postedBy;
  return parsed;
}

export async function enrichDraftBatch(
  profile: CandidateProfile,
  posts: Array<{ key: string; postedBy: string; content: string; email?: string }>
): Promise<Record<string, EnrichmentResult>> {
  if (!posts.length) return {};
  if (posts.length === 1) {
    return { [posts[0].key]: await enrichDraftFromPost(profile, posts[0]) };
  }

  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.2,
    max_tokens: Math.min(650 * posts.length, 3800),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${ENRICH_SYSTEM} For batches return {"items":[{"key":"...","phone":"...","location":"...","company":"...","contact_name":"...","hiring_summary":"...","talking_points":["..."],"matched_skills":["..."]}]} with one object per input key.`
      },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          posts: posts.map((post) => {
            const fit = evaluateSkillFit(profile.top_skills, post.content);
            return {
              key: post.key,
              recipient: post.postedBy,
              recipient_email: post.email || "",
              job_post: post.content.slice(0, 2800),
              skill_fit_hint: {
                matched_skills: fit.matchedSkills,
                post_technologies: fit.postTechs
              }
            };
          })
        })
      }
    ]
  });

  const parsed = jsonFromResponse(response.choices[0]?.message.content) as { items?: unknown; drafts?: unknown };
  const items = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.drafts) ? parsed.drafts : [];
  const byKey: Record<string, EnrichmentResult> = {};

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = asString(row.key);
    if (!key) continue;
    byKey[key] = toEnrichmentResult(row);
  }

  const missing = posts.filter((post) => !byKey[post.key]);
  if (missing.length) {
    const fallbacks = await Promise.all(missing.map(async (post) => [post.key, await enrichDraftFromPost(profile, post)] as const));
    for (const [key, value] of fallbacks) byKey[key] = value;
  }

  for (const post of posts) {
    const row = byKey[post.key];
    if (!row) continue;
    if (!row.contact_name && post.postedBy) row.contact_name = post.postedBy;
    const fit = evaluateSkillFit(profile.top_skills, post.content);
    if (!row.matched_skills.length && fit.matchedSkills.length) row.matched_skills = fit.matchedSkills;
  }

  return byKey;
}

