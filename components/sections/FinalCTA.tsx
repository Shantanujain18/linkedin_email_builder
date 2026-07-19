"use client";

import { motion } from "framer-motion";
import { ContactForm } from "@/components/ui/ContactForm";
import { GlassCard } from "@/components/ui/GlassCard";

export function FinalCTA() {
  return (
    <section id="contact" className="relative overflow-hidden py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-br from-blue/40 via-background to-violet/40" />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <motion.h2
          className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <span className="gradient-text">Ready to get in the door?</span>
        </motion.h2>
        <p className="mt-4 text-text-muted">
          Start free anytime — or contact us for Pro / Done-For-You Service at{" "}
          <a
            href="mailto:shantanujain18@gmail.com"
            className="text-blue underline-offset-2 hover:underline"
          >
            shantanujain18@gmail.com
          </a>
          .
        </p>

        <GlassCard className="mx-auto mt-8 max-w-xl p-5 sm:p-6">
          <ContactForm defaultPlan="service" source="landing-cta" compact />
        </GlassCard>
      </div>
    </section>
  );
}
