"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Eye,
  FileUp,
  Handshake,
  Inbox,
  Search,
  Send
} from "lucide-react";
import { DFY_STEPS, DIY_STEPS } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";

const ICONS = {
  FileUp,
  Search,
  Bot,
  Eye,
  Send,
  Inbox,
  Handshake
} as const;

function StepList({
  steps,
  tone
}: {
  steps: typeof DIY_STEPS | typeof DFY_STEPS;
  tone: "blue" | "violet";
}) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const Icon = ICONS[step.icon as keyof typeof ICONS];
        return (
          <motion.li
            key={step.title}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: index * 0.06, duration: 0.35 }}
          >
            <div className="flex gap-3">
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  tone === "blue" ? "bg-blue/15 text-blue" : "bg-violet/15 text-violet"
                }`}
              >
                <Icon size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary">
                  <span className="mr-2 text-text-muted">{index + 1}.</span>
                  {step.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{step.body}</p>
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            <span className="gradient-text">Two Ways to Reach Recruiters</span>
          </h2>
          <p className="mt-3 text-text-muted">Pick your level of involvement</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <GlassCard className="p-6" glow="blue">
            <Badge tone="blue">DIY Tool</Badge>
            <h3 className="mt-3 font-display text-xl font-bold text-text-primary">You&apos;re in control</h3>
            <p className="mt-2 text-sm text-text-muted">
              Scrape, review, and send yourself — perfect if you want full control.
            </p>
            <div className="mt-5">
              <StepList steps={DIY_STEPS} tone="blue" />
            </div>
          </GlassCard>

          <GlassCard className="p-6" glow="violet">
            <Badge tone="violet">Done For You</Badge>
            <h3 className="mt-3 font-display text-xl font-bold text-text-primary">We do the work</h3>
            <p className="mt-2 text-sm text-text-muted">
              We scrape, draft, and send. Replies still land in your inbox.
            </p>
            <div className="mt-5">
              <StepList steps={DFY_STEPS} tone="violet" />
            </div>
          </GlassCard>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-text-muted">
          We get you in the door — you close the deal. ReachPod does not handle replies or follow-ups.
        </p>
      </div>
    </section>
  );
}
