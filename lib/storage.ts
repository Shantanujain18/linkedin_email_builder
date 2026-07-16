import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/admin";

const BUCKET = "resumes";

export type StoredResume = {
  path: string;
  filename: string;
  mime: string;
};

/** Portable storage interface — swap this file for S3/R2 later. */
export async function uploadResume(
  userId: string,
  filename: string,
  bytes: Buffer,
  mime: string
): Promise<StoredResume> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_") || "resume.pdf";
  const path = `${userId}/${Date.now()}-${safe}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime || "application/octet-stream",
    upsert: false
  });
  if (error) {
    // Fallback to service role if RLS/session upload fails
    const admin = createServiceClient();
    const retry = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime || "application/octet-stream",
      upsert: false
    });
    if (retry.error) throw new Error(retry.error.message || "Resume upload failed.");
  }
  return { path, filename: safe, mime };
}

export async function downloadResume(path: string): Promise<{ buffer: Buffer; contentType?: string } | null> {
  if (!path) return null;
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    return { buffer, contentType: data.type || undefined };
  } catch {
    return null;
  }
}

export async function deleteResume(path: string) {
  if (!path) return;
  try {
    const admin = createServiceClient();
    await admin.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}
