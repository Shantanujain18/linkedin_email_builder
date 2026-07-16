import { NextResponse } from "next/server";
import { isUser, requireUser } from "@/lib/auth";
import { getProfile, upsertProfileFromResume } from "@/lib/db";
import { extractResumeText } from "@/lib/resume";
import { extractCandidateProfile } from "@/lib/openai";
import { deleteResume, uploadResume } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isUser(user)) return user;

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

    const previous = await getProfile(user.id);
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await uploadResume(user.id, file.name, buffer, file.type || "");

    if (previous?.resume_path && String(previous.resume_path) !== stored.path) {
      await deleteResume(String(previous.resume_path));
    }

    const immediateJoiner = Number(previous?.immediate_joiner) === 1;

    await upsertProfileFromResume(user.id, {
      ...normalized,
      resume_text: resumeText,
      resume_filename: stored.filename,
      resume_mime: stored.mime || file.type || "",
      resume_path: stored.path,
      immediate_joiner: immediateJoiner
    });

    return NextResponse.json({
      profile: {
        ...normalized,
        immediate_joiner: Boolean(immediateJoiner),
        has_resume_file: true,
        resume_filename: stored.filename
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume processing failed." }, { status: 500 });
  }
}
