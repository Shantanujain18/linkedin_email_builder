"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { FAQS } from "@/lib/constants";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-16 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-display text-2xl font-extrabold sm:text-4xl">
            <span className="gradient-text">Frequently asked questions</span>
          </h2>
        </motion.div>

        <div className="mt-8 space-y-3 sm:mt-10">
          {FAQS.map((item, index) => {
            const isOpen = open === index;
            return (
              <GlassCard key={item.q} className="overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:items-center sm:gap-4 sm:px-5"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                  data-cursor="hover"
                >
                  <span className="text-sm font-semibold leading-snug text-text-primary sm:text-base">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 shrink-0 text-text-muted transition-transform",
                      isOpen && "rotate-180"
                    )}
                    size={18}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="border-t border-white/10 px-4 py-4 text-sm leading-relaxed text-text-muted sm:px-5">
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
