import Link from "next/link";
import { FOOTER_LINKS, SITE } from "@/lib/constants";

function SocialIcon({
  href,
  label,
  children
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="rounded-full border border-white/10 p-2 text-text-muted hover:text-text-primary"
      data-cursor="hover"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:gap-10 sm:px-6 sm:py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-display text-xl font-extrabold gradient-text">
            {SITE.name}
          </div>
          <p className="mt-3 max-w-sm text-sm text-text-muted">{SITE.tagline}</p>
          <div className="mt-5 flex gap-3">
            <SocialIcon href="https://x.com" label="Twitter / X">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.882 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
              </svg>
            </SocialIcon>
            <SocialIcon href="https://linkedin.com" label="LinkedIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1-.004-4.125 2.062 2.062 0 0 1 .004 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </SocialIcon>
            <SocialIcon href="https://github.com" label="GitHub">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.207 11.387.6.113.793-.26.793-.577 0-.285-.01-1.04-.016-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.332-1.757-1.332-1.757-1.09-.746.082-.73.082-.73 1.205.085 1.84 1.238 1.84 1.238 1.07 1.835 2.807 1.305 3.492.998.108-.776.42-1.305.763-1.605-2.665-.303-5.466-1.333-5.466-5.93 0-1.31.468-2.382 1.236-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.29-1.552 3.296-1.23 3.296-1.23.654 1.652.243 2.873.12 3.176.77.838 1.234 1.91 1.234 3.22 0 4.61-2.804 5.624-5.476 5.92.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.29 0 .32.19.694.8.576C20.565 21.796 24 17.297 24 12 24 5.37 18.63 0 12 0z"
                />
              </svg>
            </SocialIcon>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 md:contents">
          <div>
            <div className="text-sm font-semibold text-text-primary">Product</div>
            <ul className="mt-3 space-y-2">
              {FOOTER_LINKS.product.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-text-muted hover:text-text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold text-text-primary">Company</div>
            <ul className="mt-3 space-y-2">
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-text-muted hover:text-text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/login" className="text-sm text-text-muted hover:text-text-primary">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs leading-relaxed text-text-muted">
        © {new Date().getFullYear()} ReachPod. All rights reserved.
        <span className="mx-1 hidden sm:inline">·</span>
        <br className="sm:hidden" />
        <a href="mailto:shantanujain18@gmail.com" className="break-all hover:text-text-primary">
          shantanujain18@gmail.com
        </a>
      </div>
    </footer>
  );
}
