import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "ReachPod terms of service."
};

export default function TermsPage() {
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
          <span className="gradient-text">Terms of Service</span>
        </h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: July 19, 2026</p>

        <div className="prose-landing mt-8 space-y-6 text-sm leading-relaxed text-text-muted">
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">1. Agreement</h2>
            <p>
              By accessing or using ReachPod (“Service”), you agree to these Terms. If you do not agree,
              do not use the Service. ReachPod is operated by the ReachPod team; contact{" "}
              <a href="mailto:shantanujain18@gmail.com" className="text-blue">
                shantanujain18@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">2. What ReachPod provides</h2>
            <p>
              ReachPod helps job seekers scrape publicly visible LinkedIn recruiter posts, generate
              AI-assisted outreach drafts, and send email via the user’s own SMTP. Optional Done-For-You
              Service may include scraping, drafting, and sending on your behalf.{" "}
              <strong className="text-text-primary">
                ReachPod does not handle recruiter replies, follow-ups, interview scheduling, or job
                placement guarantees.
              </strong>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">3. Accounts &amp; eligibility</h2>
            <p>
              You must provide accurate account information and keep credentials secure. You are
              responsible for activity under your account. You must be legally able to enter a contract
              in your jurisdiction.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">4. Acceptable use</h2>
            <p>You agree not to use ReachPod to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Spam, harass, or deceive recipients</li>
              <li>Violate LinkedIn, Gmail, or other third-party terms of service</li>
              <li>Upload unlawful, infringing, or harmful content</li>
              <li>Attempt to bypass plan limits, security, or access controls</li>
              <li>Resell the Service without written permission</li>
            </ul>
            <p>We may suspend or terminate accounts that violate these Terms.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">5. Plans, billing &amp; refunds</h2>
            <p>
              Free and paid tool tiers, and Done-For-You Service pricing, are described on the website
              and may change. Service plans are typically billed quarterly. Contact us before purchase
              for current pricing. Unless required by law or agreed in writing, fees are non-refundable
              once work or access has begun.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">6. Your content &amp; credentials</h2>
            <p>
              You retain ownership of resumes, drafts, and other content you upload. You grant ReachPod
              a limited license to process that content solely to provide the Service. You are
              responsible for SMTP credentials you connect; use app passwords where possible and revoke
              access when finished.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">7. AI output</h2>
            <p>
              AI-generated emails may be inaccurate or inappropriate. You must review drafts before
              sending. ReachPod is not liable for outcomes of messages you approve or send.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">8. Disclaimers</h2>
            <p>
              The Service is provided “as is” without warranties of any kind, including merchantability,
              fitness for a particular purpose, or non-infringement. We do not guarantee interviews,
              offers, reply rates, or uninterrupted availability.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">9. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, ReachPod and its operators are not liable for
              indirect, incidental, special, consequential, or punitive damages, or any loss of
              profits, data, or opportunities arising from your use of the Service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">10. Changes</h2>
            <p>
              We may update these Terms. Continued use after changes means you accept the updated
              Terms. Material changes may be communicated by email or site notice.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">11. Contact</h2>
            <p>
              Questions about these Terms:{" "}
              <a href="mailto:shantanujain18@gmail.com" className="text-blue">
                shantanujain18@gmail.com
              </a>{" "}
              or our{" "}
              <Link href="/contact" className="text-blue">
                contact form
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
