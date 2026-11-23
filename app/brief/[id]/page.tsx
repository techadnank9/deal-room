"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, EXEC_COLOR } from "@/lib/ui";
import type { SessionState } from "@/lib/types";

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<SessionState | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ session: SessionState }>(`/api/session?id=${id}`)
      .then((r) => setS(r.session))
      .catch((e) => setErr(String(e)));
  }, [id]);

  if (err) return <p className="p-10 text-red-600">{err}</p>;
  if (!s) return <p className="p-10 text-muted">Loading brief…</p>;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.18em] text-accent">Account brief</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.02em]">{s.brief.company}</h1>
      <p className="mt-1 text-sm text-muted">
        {s.brief.domain} · pitching: {s.offering}
      </p>
      <p className="mt-6 max-w-3xl leading-relaxed text-ink/80">{s.brief.summary}</p>

      {s.brief.facts.length > 0 && (
        <ul className="mt-6 space-y-2 text-sm text-muted">
          {s.brief.facts.map((f, i) => (
            <li key={i}>
              • {f.text}{" "}
              {f.sourceUrl && (
                <a href={f.sourceUrl} target="_blank" className="text-muted underline">
                  source
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">
        Research: {s.brief.researchProvider} · Enrichment: {s.brief.enrichmentProvider} · Agent channel: {s.bandProvider}
      </p>

      <h2 className="mt-12 text-lg font-semibold">The buying committee</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {s.personas.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: EXEC_COLOR[p.id] }} />
              <span className="font-semibold">{p.name}</span>
            </div>
            <p className="text-sm text-muted">{p.title}</p>
            <p className="mt-3 text-sm italic text-muted">{p.personality}</p>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted">Priorities</p>
            <ul className="mt-1 space-y-1 text-sm">
              {p.priorities.map((x) => (
                <li key={x}>• {x}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted">Will push back on</p>
            <ul className="mt-1 space-y-1 text-sm text-ink/80">
              {p.objections.map((o) => (
                <li key={o.text}>
                  “{o.text}”{" "}
                  {o.sourceUrl && (
                    <a href={o.sourceUrl} target="_blank" className="text-xs text-muted underline">
                      src
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Starting conviction: {p.conviction}/100</p>
          </div>
        ))}
      </div>

      <Link
        href={`/room/${s.id}`}
        className="pill-dark mt-10"
      >
        Enter the room <span className="arrow">→</span>
      </Link>
    </main>
  );
}
