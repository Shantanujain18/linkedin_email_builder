"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDone(false);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo
      });
      if (resetError) throw resetError;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Email Drafter
        </p>
        <h1>Forgot password</h1>
        <p className="subtitle">
          Enter your account email and we&apos;ll send a link to set a new password.
        </p>
        {done ? (
          <p className="hint success">
            If an account exists for that email, a reset link is on the way. Check your inbox (and
            spam), then open the link to choose a new password.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button disabled={busy} type="submit">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        {error ? <p className="hint error">{error}</p> : null}
        <p className="auth-switch">
          <Link href="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
