"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CustomCursor } from "@/components/layout/CustomCursor";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { Hero } from "@/components/sections/Hero";
import { SocialProofBar } from "@/components/sections/SocialProofBar";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Comparison } from "@/components/sections/Comparison";
import { Features } from "@/components/sections/Features";
import { Numbers } from "@/components/sections/Numbers";
import { Pricing } from "@/components/sections/Pricing";
import { FAQ } from "@/components/sections/FAQ";
import { FinalCTA } from "@/components/sections/FinalCTA";

export default function LandingPage() {
  return (
    <SmoothScroll>
      <div className="landing-root min-h-screen bg-background font-body text-text-primary antialiased">
        <CustomCursor />
        <Navbar />
        <main>
          <Hero />
          <SocialProofBar />
          <HowItWorks />
          <Comparison />
          <Features />
          <Numbers />
          <Pricing />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
