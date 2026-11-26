"use client";
// Shared pieces for the signed-in app: data hooks, small UI atoms.
import { useCallback, useEffect, useState } from "react";
import type { Lead, TeamState } from "@/lib/agents/team";

export type WorkspaceInfo = {
  email: string;
  name: string | null;
  workspace: {
    id: string;
    name: string | null;
    url: string | null;
    plan: "trial" | "starter" | "growth";
    trialEnds: string | null;
    settings: {
      timezone: string;
      launchHour: number;
      days: number[];
      dailyLeadTarget: number;
      autopilot: boolean;
      active: boolean;
      signals: Record<string, boolean>;
    };
  };
  plan: { name: string; price: number; contactsPerMonth: number; mailboxes: number; agents: number };
  usage: { today: { leads: number; enrich: number; sends: number; runs: number }; month: { enrich: number; sends: number } };
};

export type Gtm = {
  state: TeamState;
  analytics: {
    funnel: { stage: string; count: number }[];
    conv: { from: string; to: string; rate: number }[];
    byIndustry: { key: string; leads: number; contacted: number; replied: number }[];
    byTier: { key: string; leads: number; contacted: number; replied: number }[];
    variants: { variant: string; channel: string; drafted: number; approved: number; replied: number }[];
    attribution: { agent: number; rep: number };
    pendingApprovals: number;
  };
  billing: { provider: string; balance: number; counts: Record<string, number>; prices: Record<string, number>; labels: Record<string, string> };
  moss: string;
};

export type AgentInfo = {
  status: { runsToday: number; lastSourceAt: number | null; inWindow: boolean; nextWindow: string | null; log: { at: string; text: string }[] };
  outbox: { id: string; lead_id: string | null; to_email: string; subject: string | null; status: string; scheduled_at: string; sent_at: string | null; error: string | null; touch_id: string | null }[];
};

export async function post<T = unknown>(url: string, body: unknown, method = "POST"): Promise<T> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}

/** Poll a JSON endpoint. */
export function usePoll<T>(url: string | null, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!url) return;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      setData(j as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [url]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling fetch; state is set after the await
    void load();
    if (!ms) return;
    const i = setInterval(() => void load(), ms);
    return () => clearInterval(i);
  }, [load, ms]);
  return { data, error, reload: load };
}

export function ago(iso?: string | number | null) {
  if (!iso) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}
export function inTime(iso?: string | null) {
  if (!iso) return "";
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 60) return "now";
  return s < 3600 ? `in ${Math.round(s / 60)} min` : s < 86400 ? `in ${Math.round(s / 3600)} hours` : `in ${Math.round(s / 86400)} days`;
}
export function host(u?: string) {
  try {
    return new URL(u!).hostname.replace(/^www\./, "");
  } catch {
    return u ?? "";
  }
}

/** 1-3 flames from the 0-100 score: 75+ top priority, 55+ strong match, else relevant. */
export function Flames({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-xs text-muted">scoring…</span>;
  const n = score >= 75 ? 3 : score >= 55 ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-0.5" title={`AI score ${score}/100`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={`h-4 w-4 ${i < n ? "fill-accent" : "fill-line"}`} aria-hidden>
          <path d="M12 2c1 3.5-1 5.5-2.5 7.2C8 11 7 12.7 7 15a5 5 0 0 0 10 0c0-2-1-3.6-2-4.8.2 1.5-.3 2.8-1.4 3.4.4-2.5-.3-5.5-1.6-11.6Z" />
        </svg>
      ))}
    </span>
  );
}

export function EmailBadge({ status }: { status?: string }) {
  const map: Record<string, [string, string]> = {
    verified: ["bg-emerald-100 text-emerald-800", "Verified"],
    risky: ["bg-amber-100 text-amber-800", "Catch-all"],
    "mx-valid": ["bg-emerald-50 text-emerald-700", "Found"],
    guessed: ["bg-amber-50 text-amber-700", "Guessed"],
    invalid: ["bg-rose-100 text-rose-700", "Invalid"],
    "no-mx": ["bg-rose-100 text-rose-700", "No mail server"],
    unknown: ["bg-line text-muted", "No email"],
  };
  const [c, t] = map[status ?? "unknown"] ?? map.unknown;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}>{t}</span>;
}

export function Pill({ children, tone = "line" }: { children: React.ReactNode; tone?: "line" | "green" | "amber" | "red" | "accent" | "ink" }) {
  const c = {
    line: "bg-line/70 text-ink",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-700",
    accent: "bg-accent/12 text-accent",
    ink: "bg-ink text-white",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Page for one person: /app/contacts/<leadId>~<contactId>. */
export const contactHref = (leadId: string, contactId: string) => `/app/contacts/${encodeURIComponent(`${leadId}~${contactId}`)}`;

export function topContact(l: Lead) {
  return l.contacts?.find((c) => c.persona && c.email) ?? l.contacts?.find((c) => c.email) ?? l.contacts?.[0];
}

export function leadState(l: Lead): "review" | "scheduled" | "in_sequence" | "replied" | "new" | "closed" {
  const st = l.stage ?? "matched";
  if (["won", "lost"].includes(st)) return "closed";
  if (["replied", "meeting"].includes(st)) return "replied";
  const seq = l.sequence ?? [];
  if (seq.some((m) => m.sentAt)) return "in_sequence";
  if (seq.some((m) => m.approval === "approved")) return "scheduled";
  if (seq.some((m) => m.approval === "pending")) return "review";
  return "new";
}

export const Btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-50",
  dark: "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50",
  ghost: "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm transition hover:border-ink disabled:opacity-50",
};
