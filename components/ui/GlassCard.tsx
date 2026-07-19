import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function GlassCard({
  children,
  className,
  glow
}: {
  children: ReactNode;
  className?: string;
  glow?: "blue" | "violet" | "none";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-[12px]",
        glow === "blue" && "shadow-blue-glow",
        glow === "violet" && "shadow-violet-glow",
        className
      )}
    >
      {children}
    </div>
  );
}
