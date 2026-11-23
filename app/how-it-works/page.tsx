import type { Metadata } from "next";
import Link from "next/link";
import FlowChart from "@/components/how/FlowChart";
import SponsorLegend from "@/components/how/SponsorLegend";
import VerifyChecklist from "@/components/how/VerifyChecklist";

export const metadata: Metadata = {
  title: "How it works | Deal Room",
  description: "How Deal Room uses Telem, Glasser, Claude, BAND, Runware and Bruin, end to end.",
};

export default function HowItWorksPage() {
  return (
    <main className="relative w-full">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <div className="relative mx-auto w-full max-w-[1360px] px-5 pb-24 pt-8 sm:px-8">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            Deal Room
          </Link>
          <Link href="/new" className="pill-dark text-[14px]">
            Start a meeting
            <span className="arrow" aria-hidden>
              →
            </span>
          </Link>
        </nav>

        <header className="rise mt-14 max-w-[820px] sm:mt-20">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">How it works</p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">
            One meeting, six sponsor tools, every step in the code.
          </h1>
          <p className="mt-5 max-w-[640px] text-[17px] leading-relaxed text-muted">
            Telem and Glasser research the account. Claude plays the buying committee. BAND carries their private
            messages. Runware paints the room. Bruin turns the call into tested tables that score it.
          </p>
        </header>

        <section className="mt-12">
          <FlowChart />
        </section>

        <section className="mt-24">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-semibold tracking-tight">Sponsors, one line each</h2>
            <p className="mt-2 text-[15px] text-muted">What each tool does in Deal Room, and the file where it happens.</p>
          </div>
          <div className="mt-8">
            <SponsorLegend />
          </div>
        </section>

        <section className="mt-24">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-semibold tracking-tight">What judges can verify</h2>
            <p className="mt-2 text-[15px] text-muted">Six things to check in a live run, with where to look.</p>
          </div>
          <div className="mt-8">
            <VerifyChecklist />
          </div>
        </section>

        <div className="mt-16 flex flex-wrap items-center gap-4">
          <Link href="/new" className="pill-dark text-[14px]">
            Start a meeting
            <span className="arrow" aria-hidden>
              →
            </span>
          </Link>
          <Link href="/" className="text-[14px] text-muted underline-offset-4 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
