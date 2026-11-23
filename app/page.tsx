import type { Metadata } from "next";
import { BuiltWith, FinalCta, Footer, Grounded, Hero, HowItWorks, Nav, Scorecard, Tagline } from "@/components/landing/Sections";

export const metadata: Metadata = {
  title: "Deal Room · Rehearse the sales call before it counts",
  description:
    "Paste a prospect URL. Three AI executives built from real research hear your pitch by voice, fact check your numbers, and vote, then you get a scorecard with evidence.",
};

export default function Landing() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex w-full flex-col">
        <Hero />
        <HowItWorks />
        <Tagline />
        <Grounded />
        <Scorecard />
        <BuiltWith />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
