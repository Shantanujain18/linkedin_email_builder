"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PRICING } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

export function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="py-16 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-2xl font-extrabold sm:text-4xl">
            <span className="gradient-text">Simple, Honest Pricing</span>
          </h2>
          <p className="mt-3 text-sm text-text-muted sm:text-base">No hidden fees. No follow-up promises.</p>
        </motion.div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm sm:gap-3">
          <span className={cn(!yearly ? "text-text-primary" : "text-text-muted")}>Monthly</span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            aria-label="Toggle yearly billing"
            onClick={() => setYearly((v) => !v)}
            className={cn(
              "relative h-7 w-12 rounded-full border border-white/15 transition",
              yearly ? "bg-blue" : "bg-white/10"
            )}
            data-cursor="hover"
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition",
                yearly ? "left-6" : "left-0.5"
              )}
            />
          </button>
          <span className={cn(yearly ? "text-text-primary" : "text-text-muted")}>
            Yearly <span className="text-blue">(2 months free)</span>
          </span>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <GlassCard className="order-2 p-5 transition sm:p-6 lg:order-1 lg:hover:scale-[1.01]">
            <div className="font-display text-lg font-bold text-text-primary">{PRICING.free.name}</div>
            <div className="mt-3 font-display text-4xl font-extrabold text-text-primary">
              $0<span className="text-base font-medium text-text-muted">/month</span>
            </div>
            <p className="mt-2 text-sm text-text-muted">{PRICING.free.blurb}</p>
            <ul className="mt-6 space-y-2">
              {PRICING.free.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-text-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-blue" />
                  {f}
                </li>
              ))}
            </ul>
            <Button href={PRICING.free.href} variant="ghost" className="mt-8 w-full">
              {PRICING.free.cta}
            </Button>
          </GlassCard>

          <GlassCard className="relative order-1 p-5 shadow-blue-glow sm:p-6 lg:order-2 lg:scale-[1.02]" glow="blue">
            <Badge tone="blue" className="absolute -top-3 left-1/2 -translate-x-1/2">
              Most Popular
            </Badge>
            <div className="font-display text-lg font-bold text-text-primary">{PRICING.pro.name}</div>
            <div className="mt-3 font-display text-4xl font-extrabold text-text-primary">
              ${yearly ? PRICING.pro.yearly : PRICING.pro.monthly}
              <span className="text-base font-medium text-text-muted">
                /{yearly ? "year" : "month"}
              </span>
            </div>
            <p className="mt-2 text-sm text-text-muted">{PRICING.pro.blurb}</p>
            <ul className="mt-6 space-y-2">
              {PRICING.pro.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-text-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-blue" />
                  {f}
                </li>
              ))}
            </ul>
            <Button href={PRICING.pro.href} variant="magnetic" className="mt-8 w-full">
              {PRICING.pro.cta}
            </Button>
          </GlassCard>

          <GlassCard className="order-3 p-5 transition sm:p-6 lg:hover:scale-[1.01]" glow="violet">
            <div className="font-display text-lg font-bold text-text-primary">{PRICING.service.name}</div>
            <div className="mt-3 font-display text-4xl font-extrabold text-text-primary">
              ${PRICING.service.quarterly}
              <span className="text-base font-medium text-text-muted">/quarter</span>
            </div>
            <p className="mt-2 text-sm text-text-muted">{PRICING.service.blurb}</p>
            <ul className="mt-6 space-y-2">
              {PRICING.service.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-text-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-violet" />
                  {f}
                </li>
              ))}
            </ul>
            <Button href={PRICING.service.href} variant="violet" className="mt-8 w-full">
              {PRICING.service.cta}
            </Button>
          </GlassCard>
        </div>

        <p className="mt-8 px-1 text-center text-sm leading-relaxed text-text-muted">
          Pro and Service are set up manually — contact{" "}
          <a href="mailto:shantanujain18@gmail.com" className="break-all text-blue underline-offset-2 hover:underline">
            shantanujain18@gmail.com
          </a>{" "}
          or use the contact form. Replies and follow-ups stay your responsibility.
        </p>
      </div>
    </section>
  );
}
