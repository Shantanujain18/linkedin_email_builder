"use client";

import { SOCIAL_PROOF } from "@/lib/constants";

export function SocialProofBar() {
  const row = [...SOCIAL_PROOF, ...SOCIAL_PROOF];
  return (
    <section className="border-y border-white/10 bg-surface/60 py-6">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        Job seekers getting recruiter replies from
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-marquee-left gap-10 whitespace-nowrap px-4 hover:[animation-play-state:paused]">
          {row.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="text-sm font-semibold tracking-wide text-text-muted/80"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
