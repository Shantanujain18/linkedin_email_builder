"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "violet" | "magnetic";

type Props = {
  variant?: Variant;
  href?: string;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-blue text-white shadow-blue-glow hover:brightness-110",
  violet: "bg-violet text-white shadow-violet-glow hover:brightness-110",
  ghost:
    "border border-white/15 bg-white/[0.03] text-text-primary hover:border-violet/50 hover:bg-violet/10",
  magnetic: "bg-blue text-white shadow-blue-glow hover:brightness-110"
};

export function Button({
  variant = "primary",
  href,
  children,
  className,
  type = "button",
  disabled,
  onClick
}: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 15 });
  const springY = useSpring(y, { stiffness: 200, damping: 15 });

  function onMove(e: React.MouseEvent<HTMLElement>) {
    if (variant !== "magnetic" && variant !== "primary") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    x.set(dx * 0.2);
    y.set(dy * 0.2);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  const classes = cn(base, variants[variant], className);
  const fullWidth = Boolean(className?.includes("w-full"));

  if (href) {
    return (
      <motion.div
        style={{ x: springX, y: springY }}
        className={cn("inline-flex", fullWidth && "w-full")}
      >
        <Link
          href={href}
          className={classes}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          data-cursor="hover"
        >
          {children}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ x: springX, y: springY }}
      className={classes}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-cursor="hover"
    >
      {children}
    </motion.button>
  );
}
