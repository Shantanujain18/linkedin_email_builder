import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string | false;
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
  priority?: boolean;
};

export function Logo({
  href = "/",
  size = 28,
  showWordmark = true,
  wordmarkClassName,
  className,
  priority = false
}: LogoProps) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={SITE.logo}
        alt={showWordmark ? "" : SITE.name}
        width={size}
        height={size}
        className="shrink-0 rounded-[6px]"
        priority={priority}
      />
      {showWordmark ? (
        <span className={cn("leading-none", wordmarkClassName)}>{SITE.name}</span>
      ) : null}
    </span>
  );

  if (href === false) return mark;

  return (
    <Link href={href} className="inline-flex no-underline" data-cursor="hover" aria-label={SITE.name}>
      {mark}
    </Link>
  );
}
