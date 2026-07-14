import OpenAI from "openai";
import type { CandidateProfile } from "./types";

export const ROLE_KEYWORDS = [
  "Backend Engineer", "Backend Developer", "Software Engineer", "SDET",
  "Automation Lead", "Python Developer", "Python Architect", "Python Lead",
  "AI Trainee", "Game Developer", "Data Engineer", "Full Stack Developer",
  "DevOps Engineer", "ML Engineer", "AI Engineer", "Data Scientist",
  "QA Engineer", "Team Lead"
];

function client() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to email_sender/.env.local.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

export async function extractCandidateProfile(resumeText: string): Promise<CandidateProfile> {
  const response = await client().chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Write a concise, professional job-application outreach email. Return only JSON with string keys subject and body. Never claim the candidate has experience not present in the profile. Mention the relevant role only if supported by the post. Do not include markdown fences. Possible role keywords: ${ROLE_KEYWORDS.join(", ")}.`
      },
      {
        role: "user",
        content: JSON.stringify({ candidate: profile, recipient: post.postedBy, job_post: post.content, recipient_email: post.email })
      }
    ]
  });
  return jsonFromResponse(response.choices[0]?.message.content) as { subject: string; body: string };
}
