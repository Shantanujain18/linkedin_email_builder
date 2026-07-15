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
  | { skip: false; subject: string; body: string; matched_skills: string[] }
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

function draftSystemPrompt(batch: boolean) {
  const shape = batch
    ? `Return only JSON: {"drafts":[{"key":"...","skip":false,"matched_skills":["..."],"subject":"...","body":"..."}|{"key":"...","skip":true,"reason":"..."}]}. Include exactly one object per input key.`
    : `Return only JSON with either {"skip":false,"matched_skills":["..."],"subject":"...","body":"..."} or {"skip":true,"reason":"..."}.`;

  return [
    "You write concise professional job-application outreach emails (under 140 words) only when the candidate is a genuine skill fit.",
    shape,
    "Skill-fit rules (strict):",
    "1. Read the full job post. Identify the required/primary technologies and role.",
    "2. Compare against candidate.skills. Prefer the strongest overlapping skills.",
    "3. SKIP if the post centers on a stack the candidate does not have (example: Angular role when candidate skills are React/Python/Django — skip, do not apply).",
    "4. React is NOT interchangeable with Angular or Vue. Django/Python is NOT interchangeable with Java/.NET unless the post clearly wants Python too.",
    "5. Never write 'although I do not have X' or offer to learn a missing primary stack. If primary stack is missing, skip.",
    "6. When fit is true, emphasize ONLY matched skills and relevant experience. Do not list unrelated skills as if they qualify for the role.",
    "7. Never invent experience. Mention a target role title only if the post supports it.",
    "8. If candidate.immediate_joiner is true, mention immediate joining availability naturally. If false, do not claim it.",
    `Possible role keywords when relevant: ${ROLE_KEYWORDS.join(", ")}.`
  ].join(" ");
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
  return { skip: false, subject, body, matched_skills: matched };
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

export async function draftEmail(
  profile: CandidateProfile,
  post: { postedBy: string; content: string; email: string }
): Promise<DraftResult> {
  const fit = evaluateSkillFit(profile.top_skills, post.content);
  if (!fit.ok) return { skip: true, reason: fit.reason };

  const response = await client().chat.completions.create({
    model: model(),
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: draftSystemPrompt(false) },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactProfile(profile),
          skill_fit_hint: {
            matched_skills: fit.matchedSkills,
            post_technologies: fit.postTechs
          },
          recipient: post.postedBy,
          job_post: post.content.slice(0, 2500),
          recipient_email: post.email
        })
      }
    ]
  });
  return toDraftResult(jsonFromResponse(response.choices[0]?.message.content) as Record<string, unknown>);
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
    max_tokens: Math.min(400 * eligible.length, 2800),
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
              job_post: post.content.slice(0, 1800),
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

  return results;
}
