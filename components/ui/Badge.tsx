import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "violet",
  className
}: {
  children: ReactNode;
  tone?: "violet" | "blue" | "muted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
        tone === "violet" && "bg-violet/15 text-violet border border-violet/30",
        tone === "blue" && "bg-blue/15 text-blue border border-blue/30",
        tone === "muted" && "bg-white/5 text-text-muted border border-white/10",
        className
      )}
    >
      {children}
    </span>
  );
}
