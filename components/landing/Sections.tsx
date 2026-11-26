import Link from "next/link";
import HeroForm from "./HeroForm";
import { Reveal } from "./Reveal";

/* ---------- shared bits ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">{children}</p>;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-sm text-white">
        D
      </span>
      Deal Room
    </Link>
  );
}

/* ---------- 1. Nav ---------- */

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Logo />
        <ul className="hidden items-center gap-7 text-sm text-muted md:flex">
          <li><a href="#how" className="hover:text-ink">How it works</a></li>
          <li><a href="#features" className="hover:text-ink">Features</a></li>
          <li><a href="#pricing" className="hover:text-ink">Pricing</a></li>
          <li><Link href="/team" className="hover:text-ink">Live demo</Link></li>
        </ul>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/app" className="hidden text-muted hover:text-ink sm:inline">
            Log in
          </Link>
          <Link href="/start" className="rounded-full bg-ink px-4 py-2 font-medium text-white transition hover:-translate-y-px">
            Start free
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* ---------- 2. Hero + 3. Video ---------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-10 pt-16 md:px-8 md:pt-24">
      <div aria-hidden="true" className="glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-[1180px] flex-col items-center text-center">
        <p className="rise mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Deal Room, your AI sales team
        </p>
        <h1 className="rise max-w-[900px] text-4xl font-semibold leading-[1.05] tracking-tight text-balance md:text-7xl">
          Your AI sales team finds buyers who need you now, and writes to them.
        </h1>
        <p className="rise mt-6 max-w-[620px] text-lg text-muted text-pretty md:text-xl">
          Enter your website. Every day it finds companies showing buying signals, reaches the right person, and sends a
          short personal email from your own mailbox.
        </p>
        <div className="rise mt-9 flex w-full justify-center">
          <HeroForm />
        </div>
        <p className="mt-4 text-sm text-muted">Every lead comes with the reason and the source.</p>
      </div>

      <Reveal className="relative mx-auto mt-14 max-w-[1080px]">
        <figure className="card overflow-hidden !rounded-[24px] p-0">
          <div className="flex items-center gap-2 border-b border-line bg-white px-4 py-3" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="ml-3 truncate rounded-full bg-paper px-3 py-1 text-xs text-muted">dealroom.app/today</span>
          </div>
          <video
            className="block aspect-video w-full bg-ink"
            src="/demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            aria-label="Product demo: Deal Room finding companies with buying signals, picking the right contact and drafting an email"
          />
          <figcaption className="sr-only">Product demo of Deal Room</figcaption>
        </figure>
      </Reveal>
    </section>
  );
}

/* ---------- 4. Four numbered blocks ---------- */

const signals = [
  { label: "Hiring surge", tone: "bg-accent/10 text-accent" },
  { label: "Just raised", tone: "bg-emerald-50 text-emerald-700" },
  { label: "Launched", tone: "bg-sky-50 text-sky-700" },
  { label: "Uses competitor", tone: "bg-amber-50 text-amber-700" },
  { label: "Looks like your customer", tone: "bg-violet-50 text-violet-700" },
];

function SignalsVisual() {
  const leads = [
    { co: "Acme Robotics", why: "Hiring 6 QA engineers in 30 days", src: "jobs.ashbyhq.com", chip: 0 },
    { co: "Northwind Health", why: "Filed Form D: $12M raised", src: "sec.gov", chip: 1 },
    { co: "Bluefin Logistics", why: "Launched a self-serve API", src: "bluefin.io/blog", chip: 2 },
  ];
  return (
    <div className="card p-5">
      <ul className="flex flex-wrap gap-2" aria-label="Signal types">
        {signals.map((s) => (
          <li key={s.label} className={`rounded-full px-3 py-1 text-xs font-medium ${s.tone}`}>
            {s.label}
          </li>
        ))}
      </ul>
      <ul className="mt-5 divide-y divide-line">
        {leads.map((l) => (
          <li key={l.co} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{l.co}</p>
              <p className="text-sm text-muted">{l.why}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${signals[l.chip].tone}`}>
                {signals[l.chip].label}
              </span>
              <p className="mt-1 text-[11px] text-muted underline decoration-line underline-offset-2">source: {l.src}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonaVisual() {
  const people = [
    { name: "Head of QA", co: "Acme Robotics", match: 94, note: "Owns the team that is hiring" },
    { name: "VP Engineering", co: "Acme Robotics", match: 81, note: "Signs off on tooling budget" },
    { name: "Recruiter", co: "Acme Robotics", match: 22, note: "Posted the jobs, not a buyer" },
  ];
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">Persona: Engineering leader, 50-500 people</p>
      <ul className="mt-4 space-y-3">
        {people.map((p) => (
          <li
            key={p.name}
            className={`flex items-center gap-4 rounded-2xl border p-3 ${p.match > 80 ? "border-line bg-white" : "border-dashed border-line opacity-60"}`}
          >
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper text-sm font-semibold">
              {p.name.split(" ").map((w) => w[0]).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="truncate text-sm text-muted">{p.note}</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-semibold ${p.match > 80 ? "text-accent" : "text-muted"}`}>{p.match}%</p>
              <p className="text-[11px] text-muted">{p.match > 80 ? "email verified" : "skipped"}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmailVisual() {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">From: you@yourcompany.com</p>
        <div role="group" aria-label="Sending mode" className="flex rounded-full bg-paper p-1 text-xs font-medium">
          <span className="rounded-full bg-ink px-3 py-1 text-white">Approve</span>
          <span className="px-3 py-1 text-muted">Autopilot</span>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-line bg-white p-4 text-sm leading-relaxed">
        <p className="font-medium">Subject: the 6 QA roles at Acme</p>
        <p className="mt-3 text-muted">
          Hi Dana, saw Acme Robotics is hiring six QA engineers this month. Teams scaling that fast usually hit flaky
          test runs first. We cut that work in half for robotics teams. Worth a 15 minute look?
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
          Why now: Hiring surge · source: jobs.ashbyhq.com
        </p>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Schedule">
        <li className="rounded-full border border-line bg-white px-3 py-1">Tue to Thu</li>
        <li className="rounded-full border border-line bg-white px-3 py-1">9:00 to 11:30 their time</li>
        <li className="rounded-full border border-line bg-white px-3 py-1">Max 30 a day</li>
      </ul>
    </div>
  );
}

function LearnVisual() {
  // Illustrative example of what the weekly report shows, not customer data.
  const rows = [
    { label: "Just raised", weeks: [4, 6, 7, 9] },
    { label: "Hiring surge", weeks: [5, 6, 8, 11] },
    { label: "Uses competitor", weeks: [3, 3, 4, 4] },
  ];
  const max = 12;
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">Reply rate by signal</p>
        <p className="text-xs text-muted">Example, weeks 1 to 4</p>
      </div>
      <div className="mt-5 space-y-5">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="mb-2 text-sm text-muted">{r.label}</p>
            <div
              className="flex h-20 items-end gap-2"
              role="img"
              aria-label={`${r.label}: reply rate ${r.weeks.join("%, ")}% over four weeks`}
            >
              {r.weeks.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted">{v}%</span>
                  <div
                    className={`w-full rounded-md ${i === r.weeks.length - 1 ? "bg-accent" : "bg-ink/15"}`}
                    style={{ height: `${(v / max) * 56}px` }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Next week: more Hiring surge leads, fewer Uses competitor.</p>
    </div>
  );
}

const blocks = [
  {
    title: "Finds buyers with a reason to talk now",
    body: "It watches public job boards, SEC Form D filings, news, launches and competitor mentions, then picks the companies that look like your customers and have something happening right now.",
    visual: <SignalsVisual />,
  },
  {
    title: "The right person, not just the right company",
    body: "Each company is matched against the buyer personas you confirmed. It reaches the person who owns the problem, with a verified work email.",
    visual: <PersonaVisual />,
  },
  {
    title: "Writes and sends from your mailbox",
    body: "A short, personal email that cites the exact signal and its source. Sent from your own mailbox on a schedule with safe daily limits, after you approve it or on autopilot.",
    visual: <EmailVisual />,
  },
  {
    title: "Gets better every week",
    body: "It tracks which signals, personas and messages get replies, and shifts the next week toward what works for you.",
    visual: <LearnVisual />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 max-w-[720px] text-3xl font-semibold tracking-tight text-balance md:text-5xl">
          From your website to booked replies, without the prospecting grind.
        </h2>
        <div className="mt-16 space-y-20 md:space-y-28">
          {blocks.map((b, i) => (
            <Reveal key={b.title}>
              <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <p className="font-mono text-sm text-accent">{i + 1}/4</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-balance md:text-4xl">{b.title}</h3>
                  <p className="mt-4 max-w-[460px] text-lg text-muted text-pretty">{b.body}</p>
                </div>
                <div className={i % 2 === 1 ? "md:order-1" : ""}>{b.visual}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 5. Live in 5 minutes ---------- */

export function QuickStart() {
  const steps = [
    { n: "01", t: "Enter your website", d: "The agent reads your site and learns what you sell and who it is for." },
    { n: "02", t: "Confirm your buyers", d: "It proposes buyer personas. Keep the ones that fit, edit or drop the rest." },
    { n: "03", t: "Replies land in your inbox", d: "Outreach starts on your schedule. Replies show up in one inbox with a draft answer ready." },
  ];
  return (
    <section className="px-5 py-20 md:px-8">
      <div className="mx-auto max-w-[1180px] rounded-[32px] bg-ink px-6 py-14 text-white md:px-14 md:py-20">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">Setup</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">Live in 5 minutes</h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="border-t border-white/15 pt-6">
              <p className="font-mono text-sm text-white/50">{s.n}</p>
              <p className="mt-3 text-xl font-semibold">{s.t}</p>
              <p className="mt-2 text-white/65">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <Link href="/start" className="pill-dark !bg-white !text-ink">
            Start free <span className="arrow !bg-ink !text-white" aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- 6. Features ---------- */

export function Features() {
  const items = [
    { t: "Signals", d: "Hiring surges, new funding, launches, competitor mentions and customer lookalikes, each with a source link." },
    { t: "Personas", d: "Buyer profiles drafted from your site and confirmed by you, used to pick the person at every company." },
    { t: "Verified emails", d: "Work emails are checked before anything is sent, so bounces stay low and your domain stays healthy." },
    { t: "Unified inbox", d: "Every reply in one place. The sequence stops on its own and a suggested answer is waiting." },
    { t: "Approve or autopilot", d: "Review each email before it goes, or let the agent send within the limits you set." },
    { t: "Talk to your team", d: "Join a voice room with Maya (research), Arjun (writing) and Elena (pipeline) and ask what they found." },
  ];
  return (
    <section id="features" className="scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <Eyebrow>Features</Eyebrow>
        <h2 className="mt-3 max-w-[720px] text-3xl font-semibold tracking-tight text-balance md:text-5xl">
          Everything an outbound rep does, done every day.
        </h2>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <li key={f.t} className="card p-6">
              <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 font-mono text-sm text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-muted">{f.d}</p>
              {f.t === "Talk to your team" && (
                <Link href="/team" className="mt-4 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline">
                  Try the live demo →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- 7. Replaces your stack ---------- */

export function ReplacesStack() {
  const tools = ["Lead database", "Signal tracking", "Email finder", "Sequencer", "Inbox"];
  return (
    <section className="px-5 py-16 md:px-8">
      <div className="mx-auto max-w-[1180px] text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Replaces your prospecting stack</h2>
        <p className="mx-auto mt-4 max-w-[560px] text-lg text-muted">
          Five tools, five logins and a spreadsheet in between. Deal Room is one agent that does all of it.
        </p>
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {tools.map((t, i) => (
            <li key={t} className="flex items-center gap-3">
              <span className="rounded-full border border-line bg-white px-4 py-2 text-sm text-muted line-through decoration-muted/50">
                {t}
              </span>
              {i < tools.length - 1 && <span aria-hidden="true" className="text-muted">+</span>}
            </li>
          ))}
        </ul>
        <p aria-hidden="true" className="mt-6 text-2xl text-muted">↓</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-medium text-white">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
          One agent: Deal Room
        </p>
      </div>
    </section>
  );
}

/* ---------- 8. Pricing ---------- */

export function Pricing() {
  const plans = [
    {
      name: "Free trial",
      price: "$0",
      per: "for 14 days",
      cta: "Start free",
      features: ["50 verified contacts", "Every signal type", "Approve or autopilot", "No card needed"],
      featured: false,
    },
    {
      name: "Starter",
      price: "$79",
      per: "per month",
      cta: "Start with Starter",
      features: ["1 agent", "500 verified contacts a month", "Email outreach from 1 mailbox", "Unified inbox", "Approve or autopilot"],
      featured: true,
    },
    {
      name: "Growth",
      price: "$199",
      per: "per month",
      cta: "Start with Growth",
      features: ["3 agents", "2,000 verified contacts a month", "3 mailboxes", "Priority signals", "Everything in Starter"],
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="scroll-mt-20 px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">Simple pricing. Cancel any time.</h2>
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <li
              key={p.name}
              className={`flex flex-col rounded-[24px] p-7 ${p.featured ? "bg-ink text-white" : "card"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.featured && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium">Most teams</span>}
              </div>
              <p className="mt-6">
                <span className="text-5xl font-semibold tracking-tight">{p.price}</span>{" "}
                <span className={p.featured ? "text-white/60" : "text-muted"}>{p.per}</span>
              </p>
              <ul className={`mt-6 flex-1 space-y-2.5 ${p.featured ? "text-white/80" : "text-muted"}`}>
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/start"
                className={`mt-8 rounded-full px-5 py-3 text-center font-medium transition hover:-translate-y-px ${
                  p.featured ? "bg-accent text-white" : "bg-ink text-white"
                }`}
              >
                {p.cta}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- 9. FAQ ---------- */

export function Faq() {
  const qs = [
    {
      q: "Is this spam?",
      a: "No. It sends a small number of emails a day from your own mailbox, only to people who match a persona you confirmed, and every email cites a real, linked reason for writing. An unsubscribe line is built in and honored automatically.",
    },
    {
      q: "Do I need to approve every email?",
      a: "Your choice. Start in Approve mode and review each draft, then switch to Autopilot when you trust it. You can switch back at any time.",
    },
    {
      q: "Where do the leads come from?",
      a: "Public sources: company job boards, SEC Form D filings, news and launch announcements, competitor mentions, and companies that look like your existing customers. Each lead links to the source it came from.",
    },
    {
      q: "Which mailboxes can I send from?",
      a: "Your own work mailbox, such as Google Workspace or Microsoft 365. Emails go out from your address, so replies come straight back to you and into the Deal Room inbox.",
    },
    {
      q: "What happens when someone replies?",
      a: "The sequence for that person stops right away, the reply lands in your unified inbox, and a suggested answer is drafted for you to edit and send.",
    },
    {
      q: "Can I cancel?",
      a: "Yes, any time from your settings. The trial needs no card, and paid plans are month to month.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-20 px-5 py-20 md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-10 md:grid-cols-[1fr_2fr]">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">Questions</h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {qs.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden="true" className="text-2xl text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[620px] text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 10. Final CTA ---------- */

export function FinalCta() {
  return (
    <section className="px-5 pb-20 pt-10 md:px-8">
      <div className="relative mx-auto flex max-w-[1180px] flex-col items-center overflow-hidden rounded-[32px] bg-ink px-6 py-16 text-center text-white md:py-24">
        <h2 className="max-w-[760px] text-3xl font-semibold tracking-tight text-balance md:text-6xl">
          See who needs you this week.
        </h2>
        <p className="mt-4 max-w-[520px] text-lg text-white/65">
          Enter your website and get your first leads, each with the reason and the source.
        </p>
        <div className="mt-9 flex w-full justify-center">
          <HeroForm dark />
        </div>
        <p className="mt-4 text-sm text-white/50">14 day free trial. No card needed.</p>
      </div>
    </section>
  );
}

/* ---------- 11. Footer ---------- */

export function Footer() {
  return (
    <footer className="border-t border-line px-5 py-10 md:px-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted">Your AI sales team. Every lead comes with the reason and the source.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <li><a href="#how" className="hover:text-ink">How it works</a></li>
            <li><a href="#features" className="hover:text-ink">Features</a></li>
            <li><a href="#pricing" className="hover:text-ink">Pricing</a></li>
            <li><a href="#faq" className="hover:text-ink">FAQ</a></li>
            <li><Link href="/team" className="hover:text-ink">Live demo</Link></li>
            <li><Link href="/app" className="hover:text-ink">Log in</Link></li>
            <li><Link href="/privacy" className="hover:text-ink">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-ink">Terms</Link></li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-[1180px] text-xs text-muted">© {new Date().getFullYear()} Deal Room</p>
    </footer>
  );
}

