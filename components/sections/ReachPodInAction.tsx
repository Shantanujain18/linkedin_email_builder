"use client";

import { motion } from "framer-motion";
import { Play, Star } from "lucide-react";
import { FEATURED_TESTIMONIAL, DEMO_VIDEO_SRC } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";

export function ReachPodInAction() {
  return (
    <section id="in-action" className="relative py-16 sm:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-64 -translate-y-1/2 bg-gradient-to-r from-blue/10 via-transparent to-violet/10 blur-3xl sm:block" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">
            <span className="gradient-text">ReachPod in Action</span>
          </h2>
          <p className="mt-3 text-sm text-text-muted sm:text-base">
            Watch how job seekers scrape LinkedIn posts, review AI drafts, and send outreach — in
            under two minutes.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:mt-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
          >
            <GlassCard className="overflow-hidden p-2 sm:p-3" glow="blue">
              <div className="relative overflow-hidden rounded-xl bg-black/40">
                <video
                  className="aspect-video w-full bg-black object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="ReachPod product demo video"
                >
                  <source src={DEMO_VIDEO_SRC} type="video/mp4" />
                  Your browser does not support embedded video.{" "}
                  <a href={DEMO_VIDEO_SRC} className="underline">
                    Download the demo
                  </a>
                  .
                </video>
                <div
                  className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10"
                  aria-hidden
                />
              </div>
              <div className="mt-3 flex items-center gap-2 px-1 text-xs text-text-muted sm:px-2">
                <Play size={14} className="shrink-0 text-blue" aria-hidden />
                <span>Extension scrape → dashboard drafts → send from your inbox</span>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: 0.1, duration: 0.45 }}
          >
            <GlassCard className="h-full p-5 sm:p-6" glow="violet">
              <Badge tone="violet">Real success story</Badge>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue to-violet text-sm font-bold text-white">
                  {FEATURED_TESTIMONIAL.initials}
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-text-primary">
                    {FEATURED_TESTIMONIAL.name}
                  </div>
                  <div className="text-sm text-text-muted">{FEATURED_TESTIMONIAL.role}</div>
                  <p className="mt-1 text-xs italic text-text-muted/90">
                    {FEATURED_TESTIMONIAL.privacyNote}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-violet/25 bg-violet/10 px-4 py-3">
                <div className="font-display text-3xl font-extrabold tracking-tight text-text-primary">
                  {FEATURED_TESTIMONIAL.daysToOffer}
                  <span className="ml-1 text-base font-semibold text-text-muted">days</span>
                </div>
                <p className="mt-1 text-sm font-medium text-violet">from first outreach to job offer</p>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-text-muted sm:text-[15px]">
                &ldquo;{FEATURED_TESTIMONIAL.quote}&rdquo;
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex gap-0.5 text-violet" aria-label="5 out of 5 stars">
                  {Array.from({ length: FEATURED_TESTIMONIAL.stars }).map((_, index) => (
                    <Star key={index} size={14} fill="currentColor" aria-hidden />
                  ))}
                </div>
                <span className="text-xs text-text-muted">{FEATURED_TESTIMONIAL.outcome}</span>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
