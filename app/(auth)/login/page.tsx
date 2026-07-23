"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback") {
      setError("That sign-in link expired or was invalid. Please sign in again.");
    }
  }, [searchParams]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
      if (signError) throw signError;
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <Link href="/" className="auth-brand">
          ReachPod
        </Link>
        <h1>Welcome back</h1>
        <p className="subtitle">Sign in to continue your outreach.</p>
        <p className="auth-switch auth-switch-top">
          New here? <Link href="/signup">Create a free account</Link>
        </p>
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="auth-forgot">
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        {error ? <p className="hint error">{error}</p> : null}
        <p className="auth-switch">
          Don&apos;t have an account? <Link href="/signup">Create one — it&apos;s free</Link>
        </p>
        <p className="auth-back">
          <Link href="/">← Back to ReachPod</Link>
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-page"><section className="card auth-card"><p>Loading…</p></section></main>}>
      <LoginForm />
    </Suspense>
  );
}
