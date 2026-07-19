import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { SITE } from "@/lib/constants";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["500", "600", "700", "800"],
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — Stop Applying. Start Getting Noticed.`,
    template: `%s · ${SITE.name}`
  },
  description: SITE.description,
  openGraph: {
    title: `${SITE.name} — AI-Powered Job Outreach`,
    description: SITE.description,
    type: "website",
    siteName: SITE.name
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.description
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a0f"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
