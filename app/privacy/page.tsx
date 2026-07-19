import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ReachPod privacy policy."
};

export default function PrivacyPage() {
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
          <span className="gradient-text">Privacy Policy</span>
        </h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: July 19, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-text-muted">
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">1. Overview</h2>
            <p>
              This Privacy Policy explains how ReachPod collects, uses, and protects information when
              you use our website and product. Contact us at{" "}
              <a href="mailto:shantanujain18@gmail.com" className="text-blue">
                shantanujain18@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">2. Information we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-text-primary">Account data:</strong> name, email, password
                (hashed by our auth provider), and profile details you enter.
              </li>
              <li>
                <strong className="text-text-primary">Product data:</strong> resumes, LinkedIn post
                imports, email drafts, send logs, and usage/quota counters.
              </li>
              <li>
                <strong className="text-text-primary">SMTP settings:</strong> host, username, and
                credentials you save to send mail (stored to provide sending; protect your app
                password).
              </li>
              <li>
                <strong className="text-text-primary">Contact form data:</strong> name, email, plan
                interest, and message when you contact us.
              </li>
              <li>
                <strong className="text-text-primary">Technical data:</strong> basic logs such as IP,
                browser type, and timestamps for security and reliability.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">3. How we use information</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Provide scraping, drafting, sending, and account features</li>
              <li>Enforce plan limits and prevent abuse</li>
              <li>Respond to contact and subscription inquiries</li>
              <li>Improve reliability, security, and product quality</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>We do not sell your personal information.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">4. AI processing</h2>
            <p>
              Resume text and job posts may be sent to third-party AI providers (for example OpenAI) to
              generate drafts and extract profile fields. Do not upload data you are not allowed to
              process that way.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">5. Sharing</h2>
            <p>We share data only with:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Infrastructure providers (hosting, database, auth, email delivery) needed to run ReachPod</li>
              <li>AI vendors used for drafting/parsing features you request</li>
              <li>Authorities when required by law</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">6. Retention</h2>
            <p>
              We keep account and product data while your account is active and for a reasonable period
              afterward for backups, disputes, and legal requirements. Contact submissions are retained
              to respond to inquiries. You may request deletion by emailing us.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">7. Security</h2>
            <p>
              We use industry-standard measures (encryption in transit, access controls, hashed
              passwords via our auth provider). No method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">8. Your choices</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Update or delete profile/resume data in the dashboard</li>
              <li>Revoke SMTP app passwords with your email provider</li>
              <li>Request account or contact-data deletion via email</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">9. Children</h2>
            <p>ReachPod is not intended for children under 16. We do not knowingly collect their data.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">10. Changes</h2>
            <p>
              We may update this Policy. Continued use after an update means you accept the revised
              Policy. The “Last updated” date will change when we do.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">11. Contact</h2>
            <p>
              Privacy requests:{" "}
              <a href="mailto:shantanujain18@gmail.com" className="text-blue">
                shantanujain18@gmail.com
              </a>{" "}
              ·{" "}
              <Link href="/contact" className="text-blue">
                Contact form
              </Link>{" "}
              ·{" "}
              <Link href="/terms" className="text-blue">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
