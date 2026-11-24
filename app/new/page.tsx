"use client";

import { useEffect, useRef, useState } from "react";
import ModelPicker from "@/components/ModelPicker";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/ui";

const DEMOS = [
  { url: "https://linear.app", offering: "An AI QA agent that writes and runs end-to-end tests on every pull request" },
  { url: "https://www.notion.com", offering: "Usage-based cloud cost monitoring that cuts AWS spend 20-30%" },
];

const COMMITTEE = [
  { role: "CFO", line: "What's the payback period?", color: "#c2410c", tilt: "-rotate-3" },
  { role: "Tech lead", line: "Who maintains the integration?", color: "#0f766e", tilt: "rotate-2 translate-y-8" },
  { role: "Procurement", line: "Why you over the cheaper vendor?", color: "#7c3aed", tilt: "-rotate-1" },
];

export default function Setup() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [offering, setOffering] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("");
  const [sellerUrl, setSellerUrl] = useState("");
  const [err, setErr] = useState("");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    await run(url, offering);
  }

  async function run(url: string, offering: string) {
    setBusy(true);
    setErr("");
    try {
      const { id } = await api<{ id: string }>("/api/session", { url, offering, model, sellerUrl });
      router.push(`/brief/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  // Prefill from the landing hero (?url=&offering=&go=1) and start right away when both are given.
  const autoStarted = useRef(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time prefill from the URL */
    const q = new URLSearchParams(window.location.search);
    const u = q.get("url") ?? "";
    const o = q.get("offering") ?? "";
    if (u) setUrl(u);
    if (o) setOffering(o);
    if (u && o && q.get("go") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      void run(u, o);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  return (
    <main className="glow relative flex min-h-screen w-full flex-col">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-8 py-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Deal Room
        </Link>
        <Link href="/deals" className="mr-4 text-sm text-muted hover:text-ink">
          Pipeline
        </Link>
        <Link href="/history" className="text-sm text-muted hover:text-ink">
          Your history
        </Link>
      </nav>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-8 pb-16 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-6xl">
            Open the deal room
            <br />
            before it <span className="text-accent">costs</span> you
            <br />
            the deal.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            Paste your prospect. Three executives, built from real data about that company, hear your pitch, check your numbers, whisper to
            each other, and vote.
          </p>

          <form onSubmit={start} className="mt-10 flex max-w-xl flex-col gap-3">
            <input
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Prospect website, e.g. acme.com"
              className="rounded-full border border-line bg-white px-6 py-4 outline-none transition focus:border-ink"
            />
            <input
              value={sellerUrl}
              onChange={(e) => setSellerUrl(e.target.value)}
              placeholder="Your company website (optional): the committee researches you too"
              className="rounded-full border border-line bg-white px-6 py-4 outline-none transition focus:border-ink"
            />
            <div className="flex items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-6 transition focus-within:border-ink">
              <input
                required
                value={offering}
                onChange={(e) => setOffering(e.target.value)}
                placeholder="What you sell, in one line"
                className="min-w-0 flex-1 bg-transparent py-2.5 outline-none"
              />
              <button disabled={busy} className="pill-dark shrink-0">
                {busy ? "Researching…" : "Research and open the room"}
                <span className="arrow">→</span>
              </button>
            </div>
            <label className="flex items-center gap-3 px-2 text-sm text-muted">
              Model for the executives
              <ModelPicker value={model} onChange={setModel} />
            </label>
            {busy && <ResearchProgress company={url} />}
            {err && <p className="px-4 text-sm text-red-600">{err}</p>}
          </form>

          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <span className="py-1.5 text-muted">Try:</span>
            {DEMOS.map((d) => (
              <button
                key={d.url}
                type="button"
                onClick={() => {
                  setUrl(d.url);
                  setOffering(d.offering);
                }}
                className="rounded-full border border-line bg-white/70 px-3 py-1.5 hover:border-ink"
              >
                {d.url.replace(/^https?:\/\/(www\.)?/, "")}
              </button>
            ))}
          </div>
        </div>

        <div className="relative hidden h-[460px] md:block">
          {COMMITTEE.map((c, i) => (
            <div
              key={c.role}
              className={`card absolute w-60 p-5 ${c.tilt}`}
              style={{ left: `${i * 26}%`, top: `${[6, 30, 54][i]}%` }}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: c.color }}>
                  {c.role.slice(0, 2).toUpperCase()}
                </span>
                <span className="rounded-full bg-black/[0.05] px-3 py-1 text-sm font-medium">{c.role}</span>
              </div>
              <p className="mt-4 text-[15px] leading-snug">“{c.line}”</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                <div className="h-full rounded-full" style={{ width: `${[38, 46, 31][i]}%`, background: c.color }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">conviction {[38, 46, 31][i]}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const STEPS = [
  "Reading their website (Telem)",
  "Searching recent news (Telem)",
  "Searching hiring signals (Telem)",
  "Searching funding and customers (Telem)",
  "Company size, funding, tech stack, people (Glasser)",
  "Researching your company (Telem)",
  "Writing the business breakdown",
  "Building the buying committee",
];

function ResearchProgress({ company }: { company: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(x + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="card mt-2 p-4 text-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">Researching {company.replace(/^https?:\/\/(www\.)?/, "")}</p>
      <ol className="mt-2 space-y-1">
        {STEPS.map((st, i) => (
          <li key={st} className={`flex items-center gap-2 ${i < n ? "text-ink" : i === n ? "font-semibold text-ink" : "text-muted/60"}`}>
            <span className={`h-2 w-2 rounded-full ${i < n ? "bg-emerald-600" : i === n ? "animate-pulse bg-accent" : "bg-black/10"}`} />
            {st}
          </li>
        ))}
      </ol>
    </div>
  );
}
