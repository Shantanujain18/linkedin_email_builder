import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ReachPod",
  description: "LinkedIn outreach draft generator"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
