import { NextResponse } from "next/server";
import { db, now } from "@/lib/db";
import { extractResumeText } from "@/lib/resume";
import { extractCandidateProfile } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("resume");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a resume file." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Resume must be smaller than 10 MB." }, { status: 400 });
    const resumeText = await extractResumeText(file);
    if (!resumeText.trim()) return NextResponse.json({ error: "No readable text was found in the resume." }, { status: 400 });
    const profile = await extractCandidateProfile(resumeText);
    const normalized = {
      name: String(profile.name ?? ""),
      yoe: String(profile.yoe ?? ""),
      top_skills: String(profile.top_skills ?? ""),
      current_role: String(profile.current_role ?? ""),
      resume_link: String(profile.resume_link ?? ""),
      phone: String(profile.phone ?? ""),
      email: String(profile.email ?? "")
    };
    db.prepare(`INSERT INTO candidate_profile (id, name, yoe, top_skills, current_role, resume_link, phone, email, resume_text, updated_at)
      VALUES (1, @name, @yoe, @top_skills, @current_role, @resume_link, @phone, @email, @resume_text, @updated_at)
      ON CONFLICT(id) DO UPDATE SET name=@name, yoe=@yoe, top_skills=@top_skills, current_role=@current_role,
      resume_link=@resume_link, phone=@phone, email=@email, resume_text=@resume_text, updated_at=@updated_at`).run({ ...normalized, resume_text: resumeText, updated_at: now() });
    return NextResponse.json({ profile: normalized });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume processing failed." }, { status: 500 });
  }
}
