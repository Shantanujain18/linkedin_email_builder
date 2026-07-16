import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  createSession,
  createUser,
  db,
  deleteSession,
  findUserByEmail,
  findUserById,
  getSessionUser,
  now,
  type User
} from "@/lib/db";

export const SESSION_COOKIE = "email_sender_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

function sessionExpiry() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  return expires;
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}

export async function requireUser(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return user;
}

export function isUser(value: User | NextResponse): value is User {
  return !(value instanceof NextResponse);
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expires = sessionExpiry();
  createSession(userId, token, expires.toISOString());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires
  });
  return token;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

function seedUserDefaults(userId: number) {
  const timestamp = now();
  db.prepare(`INSERT OR IGNORE INTO candidate_profile
    (user_id, name, yoe, top_skills, current_role, resume_link, phone, email, resume_text,
     resume_filename, resume_mime, resume_path, immediate_joiner, updated_at)
    VALUES (?, '', '', '', '', '', '', '', '', '', '', '', 0, ?)`).run(userId, timestamp);
  db.prepare(`INSERT OR IGNORE INTO smtp_settings
    (user_id, host, port, secure, user, pass, from_email, from_name, attach_resume, updated_at)
    VALUES (?, 'smtp.gmail.com', 587, 0, '', '', '', '', 1, ?)`).run(userId, timestamp);
}

export async function signupUser(email: string, password: string, name: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (findUserByEmail(normalized)) {
    throw new Error("An account with this email already exists.");
  }
  const user = createUser(normalized, name || normalized.split("@")[0], hashPassword(password));
  seedUserDefaults(user.id);
  await startSession(user.id);
  return findUserById(user.id)!;
}

export async function signinUser(email: string, password: string) {
  const row = findUserByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error("Invalid email or password.");
  }
  await startSession(row.id);
  return findUserById(row.id)!;
}
