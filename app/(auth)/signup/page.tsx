"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNeedsConfirm(false);
    try {
      const supabase = createClient();
      const { data, error: signError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() || undefined } }
      });
      if (signError) throw signError;
      if (!data.session) {
        setNeedsConfirm(true);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  if (needsConfirm) {
    return (
      <main className="auth-page">
        <section className="card auth-card">
          <Link href="/" className="auth-brand">
            ReachPod
          </Link>
          <h1>Check your email</h1>
          <p className="subtitle">
            We sent a confirmation link to <strong>{email}</strong>. Open it, then sign in to continue.
          </p>
          <Link className="btn-block" href="/login">
            Go to sign in
          </Link>
          <p className="auth-switch">
            Wrong email? <button type="button" className="linkish" onClick={() => setNeedsConfirm(false)}>Go back</button>
          </p>
          <p className="auth-back">
            <Link href="/">← Back to ReachPod</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <Link href="/" className="auth-brand">
          ReachPod
        </Link>
        <h1>Create your free account</h1>
        <p className="subtitle">Upload your resume, find people to email, and send — in a few simple steps.</p>
        <p className="auth-switch auth-switch-top">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
          />
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="hint">At least 8 characters.</p>
          <button disabled={busy} type="submit">{busy ? "Creating…" : "Create account"}</button>
        </form>
        {error ? <p className="hint error">{error}</p> : null}
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in instead</Link>
        </p>
        <p className="auth-back">
          <Link href="/">← Back to ReachPod</Link>
        </p>
      </section>
    </main>
  );
}
