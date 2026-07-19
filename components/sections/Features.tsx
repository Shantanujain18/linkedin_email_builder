"use client";

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

export function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">
            <span className="gradient-text">
              Built for getting noticed
            </span>
          </h2>
          <p className="mt-3 text-text-muted">
            Everything you need to turn recruiter posts into conversations.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = ICONS[feature.icon as keyof typeof ICONS];
            return (
              <motion.div
                key={feature.title}
                className={feature.span}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
              >
                <Tilt
                  tiltMaxAngleX={8}
                  tiltMaxAngleY={8}
                  glareEnable
                  glareMaxOpacity={0.12}
                  glareColor="#8b5cf6"
                  glarePosition="all"
                  className="h-full"
                >
                  <div data-cursor="hover" className="h-full">
                    <GlassCard className="h-full p-5">
                      <div className="mb-4 inline-flex rounded-xl bg-blue/10 p-2.5 text-blue">
                        <Icon size={18} />
                      </div>
                      <h3 className="font-display text-lg font-bold text-text-primary">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-text-muted">{feature.body}</p>
                    </GlassCard>
                  </div>
                </Tilt>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
