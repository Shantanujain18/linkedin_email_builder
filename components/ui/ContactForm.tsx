"use client";

import confetti from "canvas-confetti";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const PLANS = [
  { value: "free", label: "Free tool" },
  { value: "pro", label: "Pro ($10/mo)" },
  { value: "service", label: "Done-For-You Service ($75/quarter)" },
  { value: "general", label: "General question" }
] as const;

type Props = {
  defaultPlan?: string;
  source?: string;
  compact?: boolean;
  className?: string;
};

export function ContactForm({
  defaultPlan = "service",
  source = "website",
  compact = false,
  className
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState(defaultPlan);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, plan, message, source })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send message.");
      setDone(data.message || "Thanks — we will reply soon.");
      setName("");
      setEmail("");
      setMessage("");
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.75 },
        colors: ["#3b82f6", "#8b5cf6", "#f8fafc"]
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-white/15 bg-background/70 px-4 py-3 text-sm text-text-primary outline-none ring-blue placeholder:text-text-muted focus:ring-2";

  return (
    <form onSubmit={onSubmit} className={cn("space-y-3 text-left", className)}>
      <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-xs font-medium text-text-muted">
            Name
          </label>
          <input
            id="contact-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1.5 block text-xs font-medium text-text-muted">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-plan" className="mb-1.5 block text-xs font-medium text-text-muted">
          I&apos;m interested in
        </label>
        <select
          id="contact-plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className={field}
        >
          {PLANS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-xs font-medium text-text-muted">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={compact ? 3 : 5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={field}
          placeholder="Tell us about your target roles, timeline, or questions…"
        />
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {done ? <p className="text-sm text-blue">{done}</p> : null}

      <Button type="submit" variant="magnetic" className="w-full sm:w-auto" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
      </Button>

      <p className="text-xs text-text-muted">
        Or email{" "}
        <a className="text-blue underline-offset-2 hover:underline" href="mailto:shantanujain18@gmail.com">
          shantanujain18@gmail.com
        </a>{" "}
        directly.
      </p>
    </form>
  );
}
