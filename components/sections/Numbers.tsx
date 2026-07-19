"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform
} from "framer-motion";
import { Star } from "lucide-react";
import { STATS, TESTIMONIALS } from "@/lib/constants";
import { GlassCard } from "@/components/ui/GlassCard";

function Counter({
  value,
  suffix,
  decimals = 0
}: {
  value: number;
  suffix: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 2000, bounce: 0 });
  const display = useTransform(spring, (latest) =>
    decimals ? latest.toFixed(decimals) : Math.round(latest).toLocaleString()
  );
  const [text, setText] = useState("0");

  useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, motionValue, value]);

  useEffect(() => {
    const unsub = display.on("change", (v) => setText(v));
    return () => unsub();
  }, [display]);

  return (
    <span ref={ref} className="font-display text-2xl font-extrabold text-text-primary sm:text-4xl">
      {text}
      {suffix}
    </span>
  );
}

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...TESTIMONIALS, ...TESTIMONIALS];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div
        className={`flex w-max gap-4 py-2 hover:[animation-play-state:paused] ${
          reverse ? "animate-marquee-right" : "animate-marquee-left"
        }`}
      >
        {items.map((t, i) => (
          <GlassCard key={`${t.name}-${i}`} className="w-[min(300px,82vw)] shrink-0 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue to-violet text-sm font-bold text-white">
                {t.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary">{t.name}</div>
                <div className="text-xs text-text-muted">
                  {t.role} · {t.company}
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">&ldquo;{t.quote}&rdquo;</p>
            <div className="mt-3 flex gap-0.5 text-violet">
              {Array.from({ length: t.stars }).map((_, s) => (
                <Star key={s} size={12} fill="currentColor" />
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

export function Numbers() {
  return (
    <section className="py-16 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <Counter
                value={stat.value}
                suffix={stat.suffix}
                decimals={"decimals" in stat ? stat.decimals : 0}
              />
              <div className="mt-2 text-xs text-text-muted sm:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-10 space-y-4 sm:mt-14">
          <MarqueeRow />
          <div className="hidden sm:block">
            <MarqueeRow reverse />
          </div>
        </div>
      </div>
    </section>
  );
}
