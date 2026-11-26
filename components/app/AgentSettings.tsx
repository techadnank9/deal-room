"use client";
// Agent settings blocks: advanced targeting, do-not-contact list, campaign settings, company knowledge, CSV import.
import { useEffect, useState } from "react";
import type { TeamState } from "@/lib/agents/team";
import { DEFAULT_CAMPAIGN, DEFAULT_TARGETING, type CampaignSettings, type Knowledge, type Targeting } from "@/lib/gtm/types";
import { Btn, post } from "./ui";

function ChipInput({ label, items, onChange, tone, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; tone: "red" | "green"; placeholder: string }) {
  const [d, setD] = useState("");
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white p-2">
        {items.map((x) => (
          <span key={x} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${tone === "red" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>
            {x}
            <button type="button" aria-label={`Remove ${x}`} onClick={() => onChange(items.filter((y) => y !== x))}>×</button>
          </span>
        ))}
        <input
          value={d}
          onChange={(e) => setD(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && d.trim()) {
              e.preventDefault();
              onChange([...new Set([...items, d.trim()])]);
              setD("");
            }
          }}
          placeholder={placeholder}
          className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          aria-label={label}
        />
      </div>
    </div>
  );
}

export function TargetingCard({ t, reload }: { t: TeamState; reload: () => Promise<void> }) {
  const [g, setG] = useState<Targeting>({ ...DEFAULT_TARGETING, ...(t.targeting ?? {}) });
  const [saved, setSaved] = useState(false);
  const toggles: [keyof Targeting, string][] = [
    ["excludeServiceProviders", "Agencies and service providers"],
    ["excludeFreelancers", "Freelancers"],
    ["excludeConsultants", "Consultancies"],
  ];
  return (
    <div className="card space-y-5 p-5">
      <div>
        <p className="font-medium">Advanced targeting</p>
        <p className="text-sm text-muted">Rules every search follows before a company becomes a lead.</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Exclude</p>
        <div className="flex flex-wrap gap-2">
          {toggles.map(([k, label]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${g[k] ? "border-ink" : "border-line"}`}>
              <input type="checkbox" className="accent-[#ff4a1c]" checked={Boolean(g[k])} onChange={(e) => setG({ ...g, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <ChipInput label="Keywords to exclude" tone="red" items={g.excludeKeywords} onChange={(excludeKeywords) => setG({ ...g, excludeKeywords })} placeholder="e.g. agency, recruiting — press Enter" />
      <ChipInput label="Must mention at least one (optional)" tone="green" items={g.mandatoryKeywords} onChange={(mandatoryKeywords) => setG({ ...g, mandatoryKeywords })} placeholder="e.g. SaaS, healthcare — press Enter" />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Extra rules in plain words (optional)</span>
        <textarea rows={2} value={g.extraCriteria} onChange={(e) => setG({ ...g, extraCriteria: e.target.value })} placeholder="e.g. Must sell to hospitals in the US; skip companies owned by private equity" className="w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-ink" />
      </label>
      <div>
        <p className="mb-2 text-sm font-medium">How strict</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["high", "High precision", "Only strong matches get an email. Fewer, better leads."],
              ["broad", "Broader", "Anyone who fits your profile. More leads."],
              ["off", "No score filter", "Every lead the signals find gets an email."],
            ] as const
          ).map(([k, title, text]) => (
            <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm ${g.precision === k ? "border-accent ring-1 ring-accent" : "border-line"}`}>
              <input type="radio" name="precision" className="sr-only" checked={g.precision === k} onChange={() => setG({ ...g, precision: k })} />
              <b className="font-medium">{title}</b>
              <span className="mt-0.5 block text-xs text-muted">{text}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          className={Btn.dark}
          onClick={async () => {
            await post("/api/gtm", { action: "agentSettings", targeting: g });
            await reload();
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          }}
        >
          Save targeting
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved. New searches use these rules.</span>}
      </div>
    </div>
  );
}

export function BlocklistCard() {
  const [list, setList] = useState<{ email: string; reason: string | null }[] | null>(null);
  const [entry, setEntry] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    post<{ blocked: { email: string; reason: string | null }[] }>("/api/gtm", { action: "blocklist" })
      .then((r) => setList(r.blocked))
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <div className="card space-y-3 p-5">
      <div>
        <p className="font-medium">Do not contact</p>
        <p className="text-sm text-muted">People and companies the agent never emails: unsubscribes, bounces, and anyone you add (customers, partners, investors).</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!entry.trim()) return;
          const r = await post<{ blocked: { email: string; reason: string | null }[] }>("/api/gtm", { action: "block", entry });
          setList(r.blocked);
          setEntry("");
        }}
      >
        <input value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="name@company.com or company.com" className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" aria-label="Email or domain to block" />
        <button className={Btn.ghost}>Add</button>
      </form>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <ul className="max-h-56 divide-y divide-line overflow-y-auto text-sm">
        {(list ?? []).map((x) => (
          <li key={x.email} className="flex items-center justify-between py-2">
            <span>
              {x.email.startsWith("@") ? `Everyone at ${x.email.slice(1)}` : x.email} <span className="text-xs text-muted">· {x.reason ?? "manual"}</span>
            </span>
            <button
              className="text-xs text-muted hover:text-ink"
              onClick={async () => {
                const r = await post<{ blocked: { email: string; reason: string | null }[] }>("/api/gtm", { action: "unblock", entry: x.email });
                setList(r.blocked);
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {list && !list.length && <li className="py-2 text-muted">Nobody yet.</li>}
      </ul>
    </div>
  );
}

export function CampaignForm({ t, reload }: { t: TeamState; reload: () => Promise<void> }) {
  const [c, setC] = useState<CampaignSettings>({ ...DEFAULT_CAMPAIGN, ...(t.campaign ?? {}) });
  const [k, setK] = useState<Knowledge>(t.knowledge ?? { valueProp: t.offering ?? "", pains: "", features: "", proof: t.intake?.customers ? `Customers: ${t.intake.customers}` : "" });
  const [saved, setSaved] = useState(false);
  const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";
  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <p className="font-medium sm:col-span-2">Campaign settings</p>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Goal</span>
          <select className={field} value={c.goal} onChange={(e) => setC({ ...c, goal: e.target.value as CampaignSettings["goal"] })}>
            <option value="meeting">Book a meeting</option>
            <option value="demo">Book a demo</option>
            <option value="reply">Start a conversation</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Tone</span>
          <select className={field} value={c.tone} onChange={(e) => setC({ ...c, tone: e.target.value as CampaignSettings["tone"] })}>
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
            <option value="formal">Formal</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Language</span>
          <input className={field} value={c.language} onChange={(e) => setC({ ...c, language: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Follow-up after (days)</span>
          <input type="number" min={2} max={14} className={field} value={c.followUpDays} onChange={(e) => setC({ ...c, followUpDays: Number(e.target.value) })} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Your ask (optional)</span>
          <input className={field} value={c.cta} onChange={(e) => setC({ ...c, cta: e.target.value })} placeholder="e.g. a 20-minute call to see your current test setup" />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="accent-[#ff4a1c]" checked={c.linkedinStep} onChange={(e) => setC({ ...c, linkedinStep: e.target.checked })} />
          Include a LinkedIn note step (you send it by hand)
        </label>
      </div>
      <div className="card grid gap-4 p-5">
        <div>
          <p className="font-medium">What the writer knows about you</p>
          <p className="text-sm text-muted">The agent only uses these facts about your product, so emails never make claims you can&apos;t back up.</p>
        </div>
        {(
          [
            ["valueProp", "What you do, in one line"],
            ["pains", "Problems you solve"],
            ["features", "Key features"],
            ["proof", "Proof: customers, results, numbers"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm">
            <span className="mb-1 block font-medium">{label}</span>
            <textarea rows={2} className={field} value={k[key]} onChange={(e) => setK({ ...k, [key]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          className={Btn.dark}
          onClick={async () => {
            await post("/api/gtm", { action: "agentSettings", campaign: c, knowledge: k });
            await reload();
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          }}
        >
          Save campaign
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved. New emails follow these settings.</span>}
      </div>
    </div>
  );
}

/** Minimal CSV parser (handles quoted fields with commas). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function ImportCsv({ reload }: { reload: () => Promise<void> }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <label className={`${Btn.ghost} cursor-pointer`}>
      Import CSV
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const rows = parseCsv(await f.text()).map((r) => ({
            company: r.company || r["company name"] || r.organization,
            domain: r.domain || r.website || r.url,
            name: r.name || r["full name"] || [r["first name"], r["last name"]].filter(Boolean).join(" "),
            title: r.title || r["job title"],
            email: r.email || r["work email"],
          }));
          const r = await post<{ imported: number }>("/api/gtm", { action: "import", rows });
          setMsg(`${r.imported} imported`);
          await reload();
          e.target.value = "";
        }}
      />
      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
    </label>
  );
}
