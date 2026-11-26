"use client";
// Buyer persona cards: on/off, titles to include and exclude, evidence. Used in setup and in the agent's Sources tab.
import { useState } from "react";
import type { Persona } from "@/lib/gtm/types";
import { host, Pill } from "./ui";

const ROLE: Record<Persona["role"], string> = { champion: "Champion", economic_buyer: "Signs the deal", user: "Daily user", blocker: "Can block" };

function Chips({ items, onChange, tone }: { items: string[]; onChange: (v: string[]) => void; tone: "line" | "red" }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((t) => (
        <span key={t} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${tone === "red" ? "bg-rose-50 text-rose-700" : "bg-paper text-ink"}`}>
          {t}
          <button type="button" aria-label={`Remove ${t}`} className="text-muted hover:text-ink" onClick={() => onChange(items.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onChange([...items, draft.trim()]);
            setDraft("");
          }
        }}
        placeholder="+ add"
        aria-label="Add a title"
        className="w-24 rounded-full border border-dashed border-line bg-transparent px-2.5 py-1 text-xs outline-none focus:border-ink"
      />
    </div>
  );
}

export default function PersonaCards({ personas, onChange }: { personas: Persona[]; onChange: (p: Persona[]) => void }) {
  const set = (i: number, patch: Partial<Persona>) => onChange(personas.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {personas.map((p, i) => (
        <div key={p.id} className={`rounded-2xl border bg-white p-5 transition ${p.enabled ? "border-line shadow-sm" : "border-dashed border-line opacity-60"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{p.label}</h3>
                <Pill tone={p.role === "economic_buyer" ? "ink" : p.role === "champion" ? "accent" : "line"}>{ROLE[p.role]}</Pill>
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {p.seniority.join(", ")} · {p.departments.join(", ")}
                {p.companySize ? ` · companies of ${p.companySize}` : ""}
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={p.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} className="h-4 w-4 accent-[#ff4a1c]" />
              Target
            </label>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Job titles to find</p>
              <Chips items={p.titles} onChange={(titles) => set(i, { titles })} tone="line" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Never contact</p>
              <Chips items={p.excludeTitles} onChange={(excludeTitles) => set(i, { excludeTitles })} tone="red" />
            </div>
            {!!p.pains.length && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">What hurts</p>
                <ul className="list-disc space-y-0.5 pl-4 text-ink/85">
                  {p.pains.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {!!p.triggers.length && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Good time to reach out</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.triggers.map((x) => (
                    <span key={x} className="rounded-full bg-accent/8 px-2.5 py-1 text-xs text-ink">
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.angle && (
              <p className="rounded-xl bg-paper px-3 py-2 text-ink/85">
                <b className="font-medium">Lead with:</b> {p.angle}
              </p>
            )}
            <p className="text-xs text-muted">
              Confidence {Math.round(p.confidence * 100)}%
              {p.evidence.length ? (
                <>
                  {" · based on "}
                  {p.evidence.map((e, k) => (
                    <a key={k} href={e.url} target="_blank" rel="noreferrer" className="underline" title={e.text}>
                      {host(e.url)}
                      {k < p.evidence.length - 1 ? ", " : ""}
                    </a>
                  ))}
                </>
              ) : (
                " · inferred from your website"
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
