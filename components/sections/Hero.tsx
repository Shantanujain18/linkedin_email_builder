"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SITE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";

const ParticleNetwork = dynamic(
  () => import("@/components/three/ParticleNetwork").then((m) => m.ParticleNetwork),
  { ssr: false }
);

const DRAFT_ROWS = [
  {
    company: "Razorpay",
    contact: "Priya Mehta",
    email: "priya.mehta@razorpay.com",
    subject: "Saw your LinkedIn post on Backend (Python) hiring",
    status: "Draft"
  },
  {
    company: "Notion",
    contact: "James Okonkwo",
    email: "james.okonkwo@notion.so",
    subject: "Re: your Product Eng hiring post",
    status: "Draft"
  },
  {
    company: "Uber",
    contact: "Ananya Iyer",
    email: "ananya.iyer@uber.com",
    subject: "Quick note on your SDE hiring post",
    status: "Sent"
  }
] as const;

export function Hero() {
  return (
    <section className="relative isolate overflow-x-hidden pt-20 pb-12 sm:pt-24 sm:pb-24">
      <ParticleNetwork />
      <div className="pointer-events-none absolute -left-24 top-24 hidden h-72 w-72 animate-orb-1 rounded-full bg-blue/30 blur-[100px] sm:block" />
      <div className="pointer-events-none absolute right-0 top-40 hidden h-80 w-80 animate-orb-2 rounded-full bg-violet/25 blur-[110px] sm:block" />
      <div className="pointer-events-none absolute bottom-10 left-1/3 hidden h-64 w-64 animate-orb-3 rounded-full bg-blue/20 blur-[90px] md:block" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 sm:gap-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Left panel */}
        <div className="relative z-10 w-full max-w-xl lg:pr-4">
          <motion.p
            className="font-display text-[clamp(2.4rem,11vw,4.5rem)] font-extrabold leading-[0.92] tracking-tight"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="gradient-text">{SITE.name}</span>
          </motion.p>

          <motion.h1
            className="mt-5 font-display text-[clamp(1.4rem,5.5vw,2.25rem)] font-bold leading-[1.2] tracking-tight text-text-primary sm:mt-6"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45 }}
          >
            Stop applying.
            <span className="mt-1 block text-text-muted">Start getting noticed.</span>
          </motion.h1>

          <motion.p
            className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-text-muted sm:mt-5 sm:text-base"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45 }}
          >
            {SITE.tagline} Scrape recruiter posts, draft skill-matched emails from your resume, then
            send via your SMTP.
          </motion.p>

          <motion.div
            className="mt-7 flex w-full flex-col gap-3 sm:mt-8 sm:w-auto sm:flex-row sm:items-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.45 }}
          >
            <Button href="/signup" variant="magnetic" className="w-full px-6 py-3 text-[15px] sm:w-auto">
              Start for free
              <ArrowRight size={16} aria-hidden />
            </Button>
            <Button href="/contact" variant="ghost" className="w-full px-6 py-3 text-[15px] sm:w-auto">
              Talk about Service
            </Button>
          </motion.div>

          <motion.p
            className="mt-4 text-xs leading-relaxed tracking-wide text-text-muted/90 sm:mt-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            Free to start · Your SMTP, your inbox · You handle replies
          </motion.p>
        </div>

        {/* Right preview */}
        <motion.div
          className="relative w-full max-w-md justify-self-center lg:max-w-none lg:justify-self-end"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.55 }}
        >
          <div className="pointer-events-none absolute inset-x-10 -bottom-6 hidden h-20 rounded-full bg-blue/30 blur-3xl sm:block" />
          <div className="sm:animate-float">
            <GlassCard className="relative overflow-hidden p-3.5 shadow-blue-glow sm:p-4" glow="blue">
              <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary">Email drafts</div>
                  <div className="text-xs text-text-muted">From LinkedIn posts · 2 draft · 1 sent</div>
                </div>
                <span className="shrink-0 rounded-full bg-blue/20 px-2 py-1 text-[10px] font-semibold text-blue">
                  Skill-matched
                </span>
              </div>
              <div className="space-y-2.5 sm:space-y-3">
                {DRAFT_ROWS.map((row) => (
                  <div
                    key={row.email}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-xs text-text-muted">
                        <span className="font-medium text-text-primary">{row.company}</span>
                        {" · "}
                        {row.contact}
                      </div>
                      <span
                        className={
                          row.status === "Sent"
                            ? "shrink-0 text-[10px] font-semibold text-blue"
                            : "shrink-0 text-[10px] font-semibold text-violet"
                        }
                      >
                        {row.status}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-text-muted">{row.email}</div>
                    <div className="mt-1 truncate text-sm text-text-primary">{row.subject}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
