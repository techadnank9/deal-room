import type { Metadata } from "next";
import {
  Faq,
  Features,
  FinalCta,
  Footer,
  Hero,
  HowItWorks,
  Nav,
  Pricing,
  QuickStart,
  ReplacesStack,
} from "@/components/landing/Sections";

export const metadata: Metadata = {
  title: "Deal Room · Your AI sales team",
  description:
    "Enter your website. Deal Room finds companies showing buying signals, reaches the right person with a verified email, and writes a short personal email that cites the reason and the source, sent from your own mailbox.",
};

export default function Landing() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex w-full flex-col">
        <Hero />
        <HowItWorks />
        <QuickStart />
        <Features />
        <ReplacesStack />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
