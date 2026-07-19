"use client";

import { motion } from "framer-motion";
import { Check, Minus, X } from "lucide-react";
import { COMPARISON_ROWS } from "@/lib/constants";
import { GlassCard } from "@/components/ui/GlassCard";

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto text-blue" size={16} />;
  if (value === false) return <Minus className="mx-auto text-text-muted/50" size={16} />;
  if (value === "You") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
        <X size={12} className="text-violet" /> You
      </span>
    );
  }
  return <span className="text-xs font-medium text-text-primary">{value}</span>;
}

export function Comparison() {
  return (
    <section id="comparison" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">
            <span className="gradient-text">
              Tool vs Service
            </span>
          </h2>
          <p className="mt-3 text-text-muted">Same engine. Different levels of done-for-you.</p>
        </motion.div>

        <GlassCard className="mt-10 overflow-x-auto p-2 sm:p-4">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-text-muted">
                <th className="px-3 py-3 font-medium">Feature</th>
                <th className="px-3 py-3 text-center font-medium">Free</th>
                <th className="px-3 py-3 text-center font-medium">Tool ($10/mo)</th>
                <th className="px-3 py-3 text-center font-medium">Service ($75/qtr)</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-white/5">
                  <td className="px-3 py-3 text-sm text-text-primary">{row.feature}</td>
                  <td className="px-3 py-3 text-center">
                    <Cell value={row.free} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Cell value={row.pro} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Cell value={row.service} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>

        <p className="mt-6 text-center text-sm text-text-muted">
          No one handles your replies — that&apos;s your job. We just fill your inbox with opportunities.
        </p>
      </div>
    </section>
  );
}
