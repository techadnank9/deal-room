"use client";
// Onboarding after sign-up: business → buyers (personas) → signals → mailbox → launch.
import { useState } from "react";
import PersonaCards from "@/components/app/PersonaCards";
import { Btn, post, usePoll, type Gtm, type WorkspaceInfo } from "@/components/app/ui";
import type { Persona } from "@/lib/gtm/types";

const STEPS = ["Your business", "Your buyers", "Signals", "Mailbox", "Launch"];

const SIGNALS: { key: string; title: string; text: string }[] = [
  { key: "hiring", title: "Hiring surges", text: "Companies opening roles in the team that has the problem you solve, counted from their own job board." },
  { key: "funding", title: "New funding", text: "Companies that just raised money: SEC Form D filings and funding news." },
  { key: "web", title: "Buying signals on the web", text: "Launches, expansions and leadership changes found by live web search." },
  { key: "competitors", title: "Competitor moves", text: "Companies mentioning or switching from tools you compete with." },
  { key: "lookalikes", title: "Lookalikes of your customers", text: "Companies that read like the customers on your website." },
];

export default function Setup() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { data: gtm, reload } = usePoll<Gtm>("/api/gtm", step < 2 ? 4000 : 0);
  const { data: me, reload: reloadMe } = usePoll<WorkspaceInfo>("/api/workspace", 0);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [signals, setSignals] = useState<Record<string, boolean> | null>(null);
  const [box, setBox] = useState({ preset: "zoho_business", email: "", fromName: "", password: "", dailyCap: 30 });
  const [boxDone, setBoxDone] = useState(false);
  const [mode, setMode] = useState<"review" | "autopilot">("review");
  const [target, setTarget] = useState(15);

  const t = gtm?.state;
  const ps = personas ?? t?.personas ?? null;
  const sig = signals ?? me?.workspace.settings.signals ?? null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-8 py-8">
      <ol className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${i < step ? "bg-ink text-white" : i === step ? "bg-accent text-white" : "bg-white text-muted"}`}>{i < step ? "✓" : i + 1}</span>
            <span className={i === step ? "font-medium" : "text-muted"}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-5">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">{t?.company ? `Here's what we learned about ${t.company}` : "Reading your website…"}</h1>
            <p className="mt-1 text-muted">Check it looks right. You can change any of this later in your agent&apos;s Sources tab.</p>
          </header>
          {!t?.company ? (
            <div className="card flex items-center gap-3 p-6 text-sm">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> Maya is reading {me?.workspace.url ?? "your website"}…
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="card p-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">What you sell</p>
                <p className="mt-1 text-lg">{t.offering}</p>
                {t.intake?.customers && (
                  <>
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Customers on your site</p>
                    <p className="mt-1">{t.intake.customers}</p>
                  </>
                )}
              </div>
              <div className="card p-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Who buys it</p>
                {t.icpSpec ? (
                  <>
                    <p className="mt-1 text-lg">{t.icpSpec.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {t.icpSpec.industries.map((x) => (
                        <span key={x.name} className="rounded-full bg-paper px-2.5 py-1 text-xs">{x.name}</span>
                      ))}
                      <span className="rounded-full bg-paper px-2.5 py-1 text-xs">{t.icpSpec.companySize.headcount} employees</span>
                      {t.icpSpec.regions.map((x) => (
                        <span key={x.name} className="rounded-full bg-paper px-2.5 py-1 text-xs">{x.name}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Working out your ideal customer…
                  </p>
                )}
                {!!t.competitors?.length && (
                  <>
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Competitors (never contacted)</p>
                    <p className="mt-1 text-sm">{t.competitors.map((c) => c.name).join(", ")}</p>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button className={Btn.primary} disabled={!t?.icpSpec} onClick={() => setStep(1)}>
              Looks right, next
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Who should the agent contact?</h1>
              <p className="mt-1 text-muted">These are the people inside your target companies. Turn off any you don&apos;t want, add or remove titles (press Enter).</p>
            </div>
            <button
              className={Btn.ghost}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await post("/api/gtm", { action: "personas" }).catch(() => {});
                setPersonas(null);
                await reload();
                setBusy(false);
              }}
            >
              {busy ? "Thinking…" : "Suggest again"}
            </button>
          </header>
          {!ps?.length ? (
            <div className="card flex items-center gap-3 p-6 text-sm">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> Maya is working out the buying group from your customer stories…
            </div>
          ) : (
            <PersonaCards personas={ps} onChange={setPersonas} />
          )}
          <div className="flex justify-between">
            <button className={Btn.ghost} onClick={() => setStep(0)}>Back</button>
            <button
              className={Btn.primary}
              disabled={!ps?.some((p) => p.enabled) || busy}
              onClick={async () => {
                setBusy(true);
                await post("/api/gtm", { action: "savePersonas", personas: ps, confirm: true });
                setBusy(false);
                setStep(2);
              }}
            >
              Confirm buyers
            </button>
          </div>
        </section>
      )}

      {step === 2 && sig && (
        <section className="space-y-5">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">Where should the agent look?</h1>
            <p className="mt-1 text-muted">Signals tell the agent who needs you now. It runs a few searches a day, one signal at a time.</p>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            {SIGNALS.map((s) => (
              <label key={s.key} className={`card flex cursor-pointer items-start gap-3 p-5 ${sig[s.key] ? "" : "opacity-60"}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#ff4a1c]" checked={!!sig[s.key]} onChange={(e) => setSignals({ ...sig, [s.key]: e.target.checked })} />
                <span>
                  <b className="font-medium">{s.title}</b>
                  <span className="mt-0.5 block text-sm text-muted">{s.text}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-between">
            <button className={Btn.ghost} onClick={() => setStep(1)}>Back</button>
            <button
              className={Btn.primary}
              onClick={async () => {
                await post("/api/workspace", { settings: { signals: { ...sig, launches: sig.web } } }, "PATCH");
                await reloadMe();
                setStep(3);
              }}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">Connect the mailbox you send from</h1>
            <p className="mt-1 text-muted">Emails go out from your own address. We start at 10 a day and ramp up over two weeks, so your domain stays healthy.</p>
          </header>
          {boxDone ? (
            <div className="card p-6 text-sm">
              <b className="font-medium">{box.email}</b> is connected. Sending and reading replies both work.
            </div>
          ) : (
            <form
              className="card grid gap-4 p-6 md:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMsg(null);
                try {
                  await post("/api/mailboxes", box);
                  setBoxDone(true);
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : "Couldn't connect");
                }
                setBusy(false);
              }}
            >
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">Email provider</span>
                <select value={box.preset} onChange={(e) => setBox({ ...box, preset: e.target.value })} className="w-full rounded-xl border border-line bg-white px-3 py-2.5">
                  <option value="zoho_business">Zoho Mail (your company domain)</option>
                  <option value="gmail">Google Workspace / Gmail</option>
                  <option value="outlook">Microsoft 365 / Outlook</option>
                  <option value="zoho">Zoho Mail (@zohomail.com)</option>
                  <option value="fastmail">Fastmail</option>
                </select>
                <span className="mt-1 block text-xs text-muted">
                  {box.preset.startsWith("zoho")
                    ? "In Zoho Mail: Settings → Mail Accounts → IMAP Access → turn on. Then accounts.zoho.com → Security → App Passwords → create one for Deal Room."
                    : box.preset === "gmail"
                      ? "Turn on 2-step verification, then create an app password at myaccount.google.com/apppasswords."
                      : "Use an app password from your email provider's security settings."}
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Email address</span>
                <input type="email" required value={box.email} onChange={(e) => setBox({ ...box, email: e.target.value })} className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Name people see</span>
                <input required value={box.fromName} onChange={(e) => setBox({ ...box, fromName: e.target.value })} placeholder="e.g. Sam from Acme" className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">App password</span>
                <input type="password" required autoComplete="new-password" value={box.password} onChange={(e) => setBox({ ...box, password: e.target.value })} className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
                <span className="mt-1 block text-xs text-muted">An app password, not your normal password. Stored encrypted.</span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Max emails a day</span>
                <input type="number" min={5} max={60} value={box.dailyCap} onChange={(e) => setBox({ ...box, dailyCap: Number(e.target.value) })} className="w-full rounded-xl border border-line bg-white px-3 py-2.5" />
              </label>
              {msg && <p className="text-sm text-rose-600 md:col-span-2">{msg}</p>}
              <div className="md:col-span-2">
                <button className={Btn.dark} disabled={busy}>{busy ? "Testing sending and inbox…" : "Connect and test"}</button>
              </div>
            </form>
          )}
          <div className="flex justify-between">
            <button className={Btn.ghost} onClick={() => setStep(2)}>Back</button>
            <button className={Btn.primary} onClick={() => setStep(4)}>{boxDone ? "Next" : "Skip for now"}</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">How should the agent work?</h1>
            <p className="mt-1 text-muted">You can change this any time in Settings.</p>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["review", "Review mode (recommended to start)", "The agent finds leads and writes emails. Nothing is sent until you approve it in the Review tab."],
                ["autopilot", "Autopilot", "The agent writes and sends on schedule within your daily limits. Replies still come to you."],
              ] as const
            ).map(([k, title, text]) => (
              <label key={k} className={`card flex cursor-pointer items-start gap-3 p-5 ${mode === k ? "ring-2 ring-accent" : ""}`}>
                <input type="radio" name="mode" className="mt-1 accent-[#ff4a1c]" checked={mode === k} onChange={() => setMode(k)} />
                <span>
                  <b className="font-medium">{title}</b>
                  <span className="mt-0.5 block text-sm text-muted">{text}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="card flex flex-wrap items-center gap-4 p-5 text-sm">
            <label className="flex items-center gap-2">
              New leads per day
              <input type="number" min={5} max={50} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-20 rounded-lg border border-line px-2 py-1" />
            </label>
            <span className="text-muted">
              Sends happen on weekdays from {me?.workspace.settings.launchHour ?? 9}:00 ({me?.workspace.settings.timezone ?? "your time zone"}).
            </span>
          </div>
          {msg && <p className="text-sm text-rose-600">{msg}</p>}
          <div className="flex justify-between">
            <button className={Btn.ghost} onClick={() => setStep(3)}>Back</button>
            <button
              className={Btn.primary}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                await post("/api/workspace", { settings: { autopilot: mode === "autopilot", dailyLeadTarget: target, timezone: tz } }, "PATCH");
                await post("/api/agent", { action: "launch" });
                void post("/api/agent", { action: "run_now" }).catch(() => {});
                window.location.href = "/app/agent";
              }}
            >
              {busy ? "Launching…" : "Launch my agent"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
