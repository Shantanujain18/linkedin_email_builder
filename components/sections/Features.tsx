"use client";

import { useEffect, useState } from "react";
import Tilt from "react-parallax-tilt";
import { motion } from "framer-motion";
import {
  FileSearch,
  LayoutDashboard,
  LineChart,
  Mails,
  Radar,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { FEATURES } from "@/lib/constants";
import { GlassCard } from "@/components/ui/GlassCard";

const ICONS = {
  Radar,
  Sparkles,
  Mails,
  LayoutDashboard,
  Users,
  FileSearch,
  LineChart,
  ShieldCheck
} as const;

function FeatureCard({
  title,
  body,
  icon: Icon
}: {
  title: string;
  body: string;
  icon: (typeof ICONS)[keyof typeof ICONS];
}) {
  return (
    <div data-cursor="hover" className="h-full">
      <GlassCard className="h-full p-5">
        <div className="mb-4 inline-flex rounded-xl bg-blue/10 p-2.5 text-blue">
          <Icon size={18} />
        </div>
        <h3 className="font-display text-lg font-bold text-text-primary">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
      </GlassCard>
    </div>
  );
}

export function Features() {
  const [tiltEnabled, setTiltEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTiltEnabled(fine && !reduce);
  }, []);

  return (
    <section id="features" className="py-16 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-2xl font-extrabold sm:text-4xl">
            <span className="gradient-text">Built for getting noticed</span>
          </h2>
          <p className="mt-3 text-sm text-text-muted sm:text-base">
            Everything you need to turn recruiter posts into conversations.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = ICONS[feature.icon as keyof typeof ICONS];
            const card = (
              <FeatureCard title={feature.title} body={feature.body} icon={Icon} />
            );
            return (
              <motion.div
                key={feature.title}
                className={feature.span}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                {tiltEnabled ? (
                  <Tilt
                    tiltMaxAngleX={8}
                    tiltMaxAngleY={8}
                    glareEnable
                    glareMaxOpacity={0.12}
                    glareColor="#8b5cf6"
                    glarePosition="all"
                    className="h-full"
                  >
                    {card}
                  </Tilt>
                ) : (
                  card
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
