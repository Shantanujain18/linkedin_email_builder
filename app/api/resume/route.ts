import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db, now, resumesDir } from "@/lib/db";
import { extractResumeText } from "@/lib/resume";
import { extractCandidateProfile } from "@/lib/openai";

export const runtime = "nodejs";

function safeResumeName(name: string) {
  const base = path.basename(name || "resume").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base || "resume.pdf";
}

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

    const filename = safeResumeName(file.name);
    const storedName = `candidate-${Date.now()}-${filename}`;
    const resumePath = path.join(resumesDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(resumePath, buffer);

    const previous = db.prepare("SELECT resume_path, immediate_joiner FROM candidate_profile WHERE id = 1").get() as
      | { resume_path?: string; immediate_joiner?: number }
      | undefined;
    if (previous?.resume_path && previous.resume_path !== resumePath && fs.existsSync(previous.resume_path)) {
      try { fs.unlinkSync(previous.resume_path); } catch { /* ignore cleanup errors */ }
    }

    const immediateJoiner = Number(previous?.immediate_joiner) === 1 ? 1 : 0;

    db.prepare(`INSERT INTO candidate_profile
      (id, name, yoe, top_skills, current_role, resume_link, phone, email, resume_text, resume_filename, resume_mime, resume_path, immediate_joiner, updated_at)
      VALUES (1, @name, @yoe, @top_skills, @current_role, @resume_link, @phone, @email, @resume_text, @resume_filename, @resume_mime, @resume_path, @immediate_joiner, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name=@name, yoe=@yoe, top_skills=@top_skills, current_role=@current_role,
        resume_link=@resume_link, phone=@phone, email=@email, resume_text=@resume_text,
        resume_filename=@resume_filename, resume_mime=@resume_mime, resume_path=@resume_path,
        immediate_joiner=@immediate_joiner, updated_at=@updated_at
    `).run({
      ...normalized,
      resume_text: resumeText,
      resume_filename: filename,
      resume_mime: file.type || "",
      resume_path: resumePath,
      immediate_joiner: immediateJoiner,
      updated_at: now()
    });
    return NextResponse.json({
      profile: {
        ...normalized,
        immediate_joiner: Boolean(immediateJoiner),
        has_resume_file: true,
        resume_filename: filename
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume processing failed." }, { status: 500 });
  }
}
