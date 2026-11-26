"use client";
// Settings: mailboxes, schedule & limits, company, plan & billing, account.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Empty, Pill, post, usePoll, type Gtm, type WorkspaceInfo } from "@/components/app/ui";
import { DEFAULT_PREFS, type Prefs } from "@/lib/gtm/types";

type Check = { ok: boolean; label: string; detail: string; fix?: string };
type Mailbox = {
  id: string;
  email: string;
  fromName: string;
  dailyCap: number;
  warmupStart?: string;
  status: string;
  smtpHost: string;
  dns?: { domain: string; checks: Record<"mx" | "spf" | "dkim" | "dmarc", Check>; allSet: boolean; toFix: number } | null;
  pause?: { reason: string; at: string } | null;
  bounces?: { sent: number; bounced: number };
};
type Preset = { id: string; label: string; help: string };
type Settings = WorkspaceInfo["workspace"]["settings"];

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];
const PLANS = [
  { id: "starter", name: "Starter", price: 79, points: ["500 contacts a month", "1 mailbox", "1 agent"] },
  { id: "growth", name: "Growth", price: 199, points: ["2,000 contacts a month", "3 mailboxes", "3 agents"] },
] as const;

function Section({ title, sub, children, id }: { title: string; sub: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-white p-6">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mb-5 text-sm text-muted">{sub}</p>
      {children}
    </section>
  );
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
      {msg.text}
    </p>
  );
}

export default function SettingsPage() {
  const { data: me, error, reload } = usePoll<WorkspaceInfo>("/api/workspace", 0);
  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted">Connect the mailbox your agent sends from, set when it works, and manage your plan.</p>
        </header>
        {error && !me && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Couldn&apos;t load your settings: {error}</p>}
        <div className="max-w-3xl space-y-6">
          <Mailboxes />
          {me ? (
            <>
              <Schedule key={me.workspace.id} initial={me.workspace.settings} onSaved={reload} />
              <Section id="company" title="Company" sub="The website your agent learned your offer from.">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">
                    {me.workspace.url ? (
                      <a href={me.workspace.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {me.workspace.url}
                      </a>
                    ) : (
                      <span className="text-muted">No website set yet</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Link href="/app/agent?tab=campaign" className={Btn.ghost}>
                      What the writer knows
                    </Link>
                    <Link href="/app/agent?tab=sources" className={Btn.ghost}>
                      Edit targeting
                    </Link>
                  </div>
                </div>
              </Section>
              <Preferences />
              <Billing me={me} />
              <Account email={me.email} />
            </>
          ) : (
            !error && <div className="rounded-2xl border border-line bg-white px-6 py-10 text-center text-sm text-muted">Loading settings…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-muted">{sub}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ink ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}

function Preferences() {
  const { data, reload } = usePoll<Gtm>("/api/gtm", 0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p: Prefs = { ...DEFAULT_PREFS, ...(data?.state.prefs ?? {}) };
  const [addr, setAddr] = useState<string | null>(null);
  async function set(patch: Partial<Prefs>) {
    setMsg(null);
    try {
      await post("/api/gtm", { action: "prefs", prefs: patch });
      await reload();
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    }
  }
  return (
    <Section id="prefs" title="Company preferences" sub="How the agent treats new leads. Changes apply to leads found from now on.">
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="divide-y divide-line">
          <Toggle on={p.autoEnrich} onChange={(v) => void set({ autoEnrich: v })} label="Find emails automatically" sub="Look up and verify the right people's emails for every new lead. Each lookup uses credits. Off: you press “Find email” on the leads you want." />
          <Toggle on={p.personaOnly} onChange={(v) => void set({ personaOnly: v })} label="Only write to people who match a persona" sub="The agent drafts emails only for people whose role matches one of your personas. Off: it also writes to the most senior person it found." />
          <Toggle on={p.allowCatchAll !== false} onChange={(v) => void set({ allowCatchAll: v })} label="Also email catch-all domains" sub="Some company mail servers accept every address, so an email there can't be fully verified. Small bounce risk. Addresses that are only a guess are never emailed." />
          <div className="py-3">
            <label htmlFor="postal" className="block text-sm font-medium">
              Company postal address {!p.postalAddress?.trim() && <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Required before sending</span>}
            </label>
            <p className="text-sm text-muted">Shown in small print under every email. US law (CAN-SPAM) requires a real postal address in commercial email; a PO box or registered agent address is fine.</p>
            <div className="mt-2 flex gap-2">
              <input id="postal" value={addr ?? p.postalAddress ?? ""} onChange={(e) => setAddr(e.target.value)} placeholder="e.g. 548 Market St, San Francisco, CA 94104" className={input} />
              <button className={Btn.dark} disabled={addr === null || addr.trim() === (p.postalAddress ?? "")} onClick={() => void set({ postalAddress: (addr ?? "").trim() }).then(() => setAddr(null))}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <Status msg={msg} />
    </Section>
  );
}

/** Mailboxes ramp up for 14 days after they are connected. */
function isRamping(start?: string) {
  return !!start && Date.now() - new Date(start).getTime() < 14 * 864e5;
}

function Mailboxes() {
  const { data, error, reload } = usePoll<{ mailboxes: Mailbox[]; presets: Preset[] }>("/api/mailboxes", 0);
  const [preset, setPreset] = useState("");
  const [email, setEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [password, setPassword] = useState("");
  const [dailyCap, setDailyCap] = useState(30);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<{ error: string; smtp?: string; imap?: string } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const presets = data?.presets ?? [];
  const chosen = presets.find((p) => p.id === (preset || presets[0]?.id));
  const steps = chosen?.help.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean) ?? [];

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setFail(null);
    setOk(null);
    try {
      const r = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, fromName, preset: chosen.id, password, dailyCap }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; smtp?: string; imap?: string };
      if (!r.ok) {
        setFail({ error: j.error || `Request failed (${r.status})`, smtp: j.smtp, imap: j.imap });
        return;
      }
      setOk(`Connected ${email}. Sending and reply checks both work.`);
      setEmail("");
      setFromName("");
      setPassword("");
      await reload();
    } catch (err) {
      setFail({ error: err instanceof Error ? err.message : "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Mailbox) {
    if (!confirm(`Remove ${b.email}? Your agent will stop sending from it.`)) return;
    setRemoving(b.id);
    try {
      await post(`/api/mailboxes?id=${encodeURIComponent(b.id)}`, {}, "DELETE");
      await reload();
    } catch (err) {
      setFail({ error: err instanceof Error ? err.message : "Couldn't remove the mailbox." });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Section id="mailboxes" title="Mailboxes" sub="Your agent sends from your own email account and reads the replies.">
      {error && !data && <p className="mb-4 text-sm text-rose-700">Couldn&apos;t load mailboxes: {error}</p>}
      {!data && !error && <p className="mb-4 text-sm text-muted">Loading mailboxes…</p>}
      {data && data.mailboxes.length === 0 && (
        <div className="mb-5">
          <Empty title="No mailbox connected">Connect one below so your agent can start sending.</Empty>
        </div>
      )}
      {data && data.mailboxes.length > 0 && (
        <ul className="mb-6 divide-y divide-line rounded-xl border border-line">
          {data.mailboxes.map((b) => {
            const ramping = isRamping(b.warmupStart);
            return (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.email}</p>
                  <p className="text-sm text-muted">
                    From &ldquo;{b.fromName}&rdquo; · up to {b.dailyCap} emails a day
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {ramping && <Pill tone="amber">Ramping up</Pill>}
                  {b.pause ? <Pill tone="red">Paused</Pill> : <Pill tone={b.status === "ok" ? "green" : "red"}>{b.status === "ok" ? "Connected" : b.status}</Pill>}
                  <button className={Btn.ghost} onClick={() => remove(b)} disabled={removing === b.id} aria-label={`Remove ${b.email}`}>
                    {removing === b.id ? "Removing…" : "Remove"}
                  </button>
                </div>
                {b.pause && (
                  <div className="w-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {b.pause.reason} Check the bounced addresses in Inbox, then{" "}
                    <button
                      className="font-medium underline"
                      onClick={async () => {
                        await fetch("/api/mailboxes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id, action: "resume" }) });
                        await reload();
                      }}
                    >
                      resume sending
                    </button>
                    .
                  </div>
                )}
                {b.dns && (
                  <details className="w-full text-sm">
                    <summary className="cursor-pointer text-muted">
                      Domain health for {b.dns.domain}:{" "}
                      {b.dns.allSet ? <span className="font-medium text-emerald-700">all set</span> : <span className="font-medium text-rose-700">{b.dns.toFix} to fix</span>}
                      {b.bounces && b.bounces.sent > 0 && (
                        <span>
                          {" "}
                          · bounces {b.bounces.bounced} of {b.bounces.sent} in 14 days ({Math.round((100 * b.bounces.bounced) / b.bounces.sent)}%; keep it under 3%)
                        </span>
                      )}
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {(["mx", "spf", "dkim", "dmarc"] as const).map((k) => {
                        const c = b.dns!.checks[k];
                        return (
                          <li key={k} className="flex gap-2">
                            <span className={c.ok ? "text-emerald-700" : "text-rose-700"}>{c.ok ? "✓" : "✕"}</span>
                            <span>
                              <span className="font-medium">{c.label}</span> <span className="break-all text-muted">{c.detail}</span>
                              {c.fix && <span className="block text-xs text-rose-700">{c.fix}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={connect} className="space-y-4 rounded-xl bg-paper/60 p-5">
        <h3 className="font-medium">Connect mailbox</h3>
        <div>
          <label htmlFor="mb-provider" className="mb-1 block text-sm font-medium">
            Email provider
          </label>
          <select id="mb-provider" className={input} value={chosen?.id ?? ""} onChange={(e) => setPreset(e.target.value)} disabled={!presets.length}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {steps.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="mb-email" className="mb-1 block text-sm font-medium">
              Email address
            </label>
            <input id="mb-email" type="email" required autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourcompany.com" />
          </div>
          <div>
            <label htmlFor="mb-from" className="mb-1 block text-sm font-medium">
              &ldquo;From&rdquo; name
            </label>
            <input id="mb-from" className={input} autoComplete="name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your name, as people will see it" />
          </div>
          <div>
            <label htmlFor="mb-pass" className="mb-1 block text-sm font-medium">
              App password
            </label>
            <input id="mb-pass" type="password" required autoComplete="new-password" aria-describedby="mb-pass-help" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
            <p id="mb-pass-help" className="mt-1 text-xs text-muted">
              An app password, not your normal password.
            </p>
          </div>
          <div>
            <label htmlFor="mb-cap" className="mb-1 block text-sm font-medium">
              Daily limit
            </label>
            <input
              id="mb-cap"
              type="number"
              min={5}
              max={60}
              className={input}
              value={dailyCap}
              onChange={(e) => setDailyCap(Math.max(5, Math.min(60, Number(e.target.value) || 30)))}
              aria-describedby="mb-cap-help"
            />
            <p id="mb-cap-help" className="mt-1 text-xs text-muted">
              Emails per day once warmed up. 60 at most.
            </p>
          </div>
        </div>

        {fail && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-medium">{fail.error}</p>
            {fail.smtp && <p className="mt-1">Sending (SMTP): {fail.smtp === "ok" ? "works" : fail.smtp}</p>}
            {fail.imap && <p>Reading replies (IMAP): {fail.imap === "ok" ? "works" : fail.imap}</p>}
          </div>
        )}
        {ok && <Status msg={{ ok: true, text: ok }} />}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={Btn.primary} disabled={busy || !chosen}>
            {busy ? "Testing connection…" : "Connect mailbox"}
          </button>
        </div>
        <p className="text-xs text-muted">We send from your own mailbox, start at 10 emails a day and ramp up over 2 weeks, and never email anyone who unsubscribed.</p>
      </form>
    </Section>
  );
}

function Schedule({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [s, setS] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const zones = [...new Set([s.timezone, browserTz, ...ZONES].filter(Boolean))];
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setMsg(null);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/workspace", { settings: { timezone: s.timezone, launchHour: s.launchHour, days: s.days, dailyLeadTarget: s.dailyLeadTarget, autopilot: s.autopilot } }, "PATCH");
      setMsg({ ok: true, text: "Saved." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  const hour = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

  return (
    <Section id="schedule" title="Schedule & limits" sub="When your agent sends, and how many new companies it looks for each day.">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="tz" className="mb-1 block text-sm font-medium">
              Time zone
            </label>
            <select id="tz" className={input} value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                  {z === browserTz ? " (yours)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hour" className="mb-1 block text-sm font-medium">
              Start sending at
            </label>
            <select id="hour" className={input} value={s.launchHour} onChange={(e) => set("launchHour", Number(e.target.value))}>
              {Array.from({ length: 9 }, (_, i) => 6 + i).map((h) => (
                <option key={h} value={h}>
                  {hour(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="target" className="mb-1 block text-sm font-medium">
              New leads a day
            </label>
            <input
              id="target"
              type="number"
              min={5}
              max={50}
              className={input}
              value={s.dailyLeadTarget}
              onChange={(e) => set("dailyLeadTarget", Math.max(5, Math.min(50, Number(e.target.value) || 5)))}
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Active days</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const on = s.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("days", on ? s.days.filter((x) => x !== i) : [...s.days, i].sort())}
                  className={`w-14 rounded-xl border py-2 text-sm transition ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-ink"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Sending mode</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { v: false, title: "Review mode", text: "Review every email before it's sent." },
              { v: true, title: "Autopilot", text: "Send approved-quality emails on schedule." },
            ].map((o) => (
              <label key={o.title} className={`cursor-pointer rounded-xl border p-4 transition ${s.autopilot === o.v ? "border-accent bg-accent/5" : "border-line hover:border-ink"}`}>
                <input type="radio" name="mode" className="sr-only" checked={s.autopilot === o.v} onChange={() => set("autopilot", o.v)} />
                <span className="block font-medium">{o.title}</span>
                <span className="block text-sm text-muted">{o.text}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button className={Btn.primary} onClick={save} disabled={busy || s.days.length === 0}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          {s.days.length === 0 && <span className="text-sm text-muted">Pick at least one day.</span>}
          <Status msg={msg} />
        </div>
      </div>
    </Section>
  );
}

function Billing({ me }: { me: WorkspaceInfo }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const used = me.usage.month.enrich;
  const limit = me.plan.contactsPerMonth;

  async function upgrade(plan: string) {
    setBusy(plan);
    setErr(null);
    try {
      const r = await post<{ url?: string; error?: string }>("/api/billing/checkout", { plan });
      if (r.url) window.location.assign(r.url);
      else setErr(r.error || "Checkout isn't available right now.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout isn't available right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section id="billing" title="Plan & billing" sub="What you're on and how much of it you've used this month.">
      <div className="mb-5 rounded-xl bg-paper/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">
            {me.plan.name} <span className="font-normal text-muted">· {me.plan.price ? `$${me.plan.price}/month` : "free"}</span>
          </p>
          {me.workspace.plan === "trial" && me.workspace.trialEnds && <p className="text-sm text-muted">Trial ends {new Date(me.workspace.trialEnds).toLocaleDateString()}</p>}
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span>Contacts this month</span>
          <span className="tabular-nums">
            {used} / {limit}
          </span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line/70" role="meter" aria-label="Contacts used this month" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${limit ? Math.min(100, (100 * used) / limit) : 0}%` }} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((p) => {
          const current = me.workspace.plan === p.id;
          return (
            <div key={p.id} className={`rounded-xl border p-5 ${current ? "border-accent" : "border-line"}`}>
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-2xl font-semibold">
                ${p.price}
                <span className="text-sm font-normal text-muted">/month</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-ink/80">
                {p.points.map((x) => (
                  <li key={x}>· {x}</li>
                ))}
              </ul>
              <button className={`${current ? Btn.ghost : Btn.primary} mt-4 w-full`} disabled={current || !!busy} onClick={() => upgrade(p.id)}>
                {current ? "Current plan" : busy === p.id ? "Opening checkout…" : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>
      {err && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {err}
        </p>
      )}
    </Section>
  );
}

function Account({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await post("/api/auth/logout", {});
    } finally {
      router.replace("/");
      router.refresh();
    }
  }
  return (
    <Section id="account" title="Account" sub="The email you sign in with.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{email}</p>
        <button className={Btn.ghost} onClick={logout} disabled={busy}>
          {busy ? "Logging out…" : "Log out"}
        </button>
      </div>
    </Section>
  );
}
