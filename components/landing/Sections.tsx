import Link from "next/link";
import {
  DecisionLogCard,
  FactCheckCard,
  PortraitCard,
  RoomReadCard,
  ScorecardMock,
  VerifiedCard,
  VoteCard,
  WhisperCard,
} from "./Mocks";
import { Reveal, TaglineReveal } from "./Reveal";

function Cta({ children = "Rehearse a call" }: { children?: React.ReactNode }) {
  return (
    <Link
      href="/new"
      className="pill-dark text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[0.98]"
    >
      {children}
      <span className="arrow" aria-hidden>
        →
      </span>
    </Link>
  );
}

export function Nav() {
  return (
    <header className="sticky top-3 z-30 px-4">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border border-line bg-paper/80 py-2 pl-5 pr-2 backdrop-blur-md">
        <Link href="/" aria-current="page" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-full px-3 py-2 text-muted transition-colors duration-300 hover:text-ink md:inline">
            How it works
          </a>
          <a href="#scorecard" className="hidden rounded-full px-3 py-2 text-muted transition-colors duration-300 hover:text-ink md:inline">
            Scorecard
          </a>
          <Link href="/history" className="rounded-full px-3 py-2 text-muted transition-colors duration-300 hover:text-ink">
            History
          </Link>
          <Link
            href="/new"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-transform duration-300 hover:-translate-y-px active:scale-[0.98]"
          >
            Start
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function Hero() {
  return (
    <section className="glow relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-24 pt-16 md:grid-cols-[1fr_1.05fr] md:items-center md:px-8 md:pt-24">
        <div className="rise">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-sm text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Sales call rehearsal, by voice
          </p>
          <h1 className="max-w-[680px] text-5xl font-semibold leading-none tracking-[-0.04em] text-balance md:text-7xl">
            Hear every <span className="text-accent">no</span>
            <br />
            before the real call.
          </h1>
          <p className="mt-6 max-w-[520px] text-lg text-muted text-pretty">
            Paste a prospect’s website and one line about what you sell. Three executives built from real research on that company hear your
            pitch out loud, check your numbers, message each other in private, and vote.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Cta />
            <Link href="/history" className="text-sm font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
              See past sessions
            </Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-2 text-sm text-muted">
            {["CFO, tech lead, procurement", "Every objection cites a source", "Numbers checked live"].map((c) => (
              <li key={c} className="rounded-full border border-line bg-white/60 px-3 py-1">
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* collage: stacked on mobile, layered on desktop */}
        <div className="relative flex flex-col items-center gap-4 md:block md:h-[640px]">
          <div className="flex gap-3 md:contents">
            <PortraitCard role="cfo" className="-rotate-3 md:absolute md:left-[2%] md:top-[2%]" />
            <PortraitCard role="tech" className="rotate-2 translate-y-4 md:absolute md:left-[36%] md:top-0 md:translate-y-0" />
            <PortraitCard role="procurement" className="-rotate-2 hidden sm:block md:absolute md:left-[70%] md:top-[6%]" />
          </div>
          <RoomReadCard className="rise md:absolute md:left-0 md:top-[41%] md:-rotate-1" />
          <FactCheckCard className="rise md:absolute md:left-[34%] md:top-[70%] md:rotate-1 [animation-delay:120ms]" />
          <WhisperCard className="rise hidden md:absolute md:left-[57%] md:top-[44%] md:block md:rotate-2 [animation-delay:240ms]" />
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    t: "Research",
    d: "Live web research and enrichment pull the prospect’s filings, hires, stack and news. Three executives are built from what comes back.",
  },
  { n: "02", t: "Brief", d: "You read who is in the room, what each of them cares about, and the facts they already know about your category." },
  { n: "03", t: "Pitch by voice", d: "Walk into a 3D meeting room and talk. They interrupt, push back and ask for numbers the way buyers do." },
  { n: "04", t: "Checks and whispers", d: "An analyst checks every figure you say on the wall screen. The executives message each other in private." },
  { n: "05", t: "Vote and scorecard", d: "Buyers walk over and shake your hand. The rest walk out. Then you see exactly why." },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-24 md:px-8">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-wider text-muted">How a rehearsal runs</p>
        <h2 className="mt-3 max-w-[680px] text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          From a URL to a vote in one sitting.
        </h2>
      </Reveal>
      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.n} className="bg-paper">
            <Reveal delay={i * 60} className="flex h-full flex-col gap-3 p-6">
              <span className="font-mono text-sm text-accent">{s.n}</span>
              <h3 className="text-lg font-semibold">{s.t}</h3>
              <p className="text-sm text-muted text-pretty">{s.d}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Tagline() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:px-8">
      <TaglineReveal lines={["Your prospect won’t tell you", "why they said no.", "This room will."]} />
    </section>
  );
}

export function Grounded() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center md:px-8">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-wider text-muted">Grounded, not made up</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance md:text-5xl">Objections come with a source.</h2>
        <p className="mt-6 max-w-[520px] text-lg text-muted text-pretty">
          When procurement brings up the vendor they renewed in May, it is because that renewal is public. When you say a number, the analyst
          searches for it while you are still talking and puts the verdict on the wall.
        </p>
        <ul className="mt-8 flex flex-col gap-4 text-base">
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="font-semibold">Busted claims are named.</strong> <span className="text-muted">The exact phrase, and what the sources actually say.</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="font-semibold">Verified claims earn trust.</strong> <span className="text-muted">Conviction moves when a fact checks out.</span>
            </span>
          </li>
        </ul>
      </Reveal>
      <Reveal delay={120} className="relative flex flex-col items-center gap-4 md:block md:h-[460px]">
        <FactCheckCard className="md:absolute md:left-[4%] md:top-[2%] md:-rotate-2" />
        <VerifiedCard className="md:absolute md:right-[0%] md:top-[38%] md:rotate-2" />
        <DecisionLogCard className="md:absolute md:left-[10%] md:top-[62%] md:-rotate-1" />
      </Reveal>
    </section>
  );
}

export function Scorecard() {
  return (
    <section id="scorecard" className="glow scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 md:px-8">
        <Reveal className="grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
          <div className="max-w-[640px]">
            <p className="font-mono text-xs uppercase tracking-wider text-muted">The scorecard</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance md:text-5xl">
              It tells you what to <span className="text-accent">fix</span>, not how you felt.
            </h2>
            <p className="mt-6 text-lg text-muted text-pretty">
              Every vote comes with the line that caused it. Every whisper is revealed. Across sessions it tracks which kinds of objection keep
              beating you.
            </p>
          </div>
          <VoteCard className="md:mr-6 md:rotate-2" />
        </Reveal>
        <Reveal delay={120} className="mt-12">
          <ScorecardMock />
        </Reveal>
      </div>
    </section>
  );
}

const SPONSORS = [
  { n: "Claude", d: "Runs the three executives and the analyst: their reasoning, objections and votes." },
  { n: "Telem", d: "Live web research on the prospect, and the claim checks you see on the wall screen." },
  { n: "Glasser", d: "Company and people enrichment that shapes who sits across the table." },
  { n: "BAND", d: "The private channel the executives use to message each other mid call." },
  { n: "Bruin", d: "Pipeline that turns session events into scorecard and trend tables, with quality checks." },
  { n: "Runware", d: "Generated executive portraits and the window backdrop of the meeting room." },
];

export function BuiltWith() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:px-8">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-wider text-muted">Built with</p>
        <h2 className="mt-3 max-w-[680px] text-3xl font-semibold tracking-tight text-balance md:text-4xl">What each piece does in the room.</h2>
      </Reveal>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SPONSORS.map((s, i) => (
          <li key={s.n}>
            <Reveal delay={i * 60} className="h-full rounded-2xl border border-line bg-white/60 p-6">
              <span className="inline-flex rounded-full bg-ink px-3 py-1 text-sm font-semibold text-white">{s.n}</span>
              <p className="mt-4 text-sm text-muted text-pretty">{s.d}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-4 pb-12">
      <Reveal className="mx-auto flex max-w-6xl flex-col items-center rounded-3xl bg-ink px-6 py-24 text-center text-white">
        <h2 className="max-w-[680px] text-4xl font-semibold tracking-tight text-balance md:text-6xl">
          Take the hard meeting <span className="text-accent">tonight.</span>
        </h2>
        <p className="mt-6 max-w-[520px] text-lg text-white/60 text-pretty">A prospect URL and one line about what you sell. That is all it needs.</p>
        <Link
          href="/new"
          className="mt-10 inline-flex items-center gap-3 rounded-full bg-white py-2 pl-5 pr-2 text-base font-semibold text-ink transition-transform duration-300 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98]"
        >
          Rehearse a call
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white" aria-hidden>
            →
          </span>
        </Link>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 pb-12 text-sm text-muted md:px-8">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <span className="h-2 w-2 rounded-full bg-accent" /> Deal Room
      </span>
      <span>Hackathon build. Executives are simulated, sources are real.</span>
      <div className="flex gap-4">
        <Link href="/new" className="hover:text-ink">
          New rehearsal
        </Link>
        <Link href="/history" className="hover:text-ink">
          History
        </Link>
      </div>
    </footer>
  );
}
