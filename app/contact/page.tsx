import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ContactForm } from "@/components/ui/ContactForm";
import { GlassCard } from "@/components/ui/GlassCard";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact ReachPod for Pro or Done-For-You subscription inquiries."
};

export default function ContactPage() {
  return (
    <div className="landing-root min-h-screen bg-background font-body text-text-primary antialiased">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
        <p className="text-sm text-text-muted">
          <Link href="/" className="hover:text-text-primary">
            ← Back to home
          </Link>
        </p>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          <span className="gradient-text">Contact us</span>
        </h1>
        <p className="mt-3 text-text-muted">
          For subscriptions (Pro or Done-For-You Service), questions, or partnerships — send a message
          below. It goes to{" "}
          <a
            href="mailto:shantanujain18@gmail.com"
            className="text-blue underline-offset-2 hover:underline"
          >
            shantanujain18@gmail.com
          </a>
          .
        </p>
        <GlassCard className="mt-8 p-5 sm:p-6">
          <ContactForm defaultPlan="service" source="contact-page" />
        </GlassCard>
        <p className="mt-6 text-sm text-text-muted">
          Want to try the tool yourself?{" "}
          <Link href="/signup" className="text-blue underline-offset-2 hover:underline">
            Create a free account
          </Link>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
}
