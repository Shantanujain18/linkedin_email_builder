"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function checkSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setReady(Boolean(session));
        setChecking(false);
      }
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setChecking(false);
      }
    });

    void checkSession();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="auth-loading">
        <p>Checking reset link…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="auth-page">
        <section className="card auth-card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Email Drafter
          </p>
          <h1>Link expired</h1>
          <p className="subtitle">
            This reset link is invalid or has expired. Request a new one and try again.
          </p>
          <p className="auth-switch">
            <Link href="/forgot-password">Request a new reset link</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Email Drafter
        </p>
        <h1>Set new password</h1>
        <p className="subtitle">Choose a new password for your account.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
          <p className="hint">At least 8 characters.</p>
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
        {error ? <p className="hint error">{error}</p> : null}
        <p className="auth-switch">
          <Link href="/login">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
