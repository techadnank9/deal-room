"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, EXEC_COLOR, initials } from "@/lib/ui";
import type { SessionState } from "@/lib/types";

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<SessionState | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      api<{ session: SessionState }>(`/api/session?id=${id}`)
        .then((r) => {
          setS(r.session);
          // Portraits are generated in the background; refresh until they land.
          if (r.session.imagesPending && tries++ < 12) timer = setTimeout(load, 3000);
        })
        .catch((e) => setErr(String(e)));
    load();
    return () => clearTimeout(timer);
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
      {s.brief.enrichment && (
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["Employees", s.brief.enrichment.employees],
              ["Funding", s.brief.enrichment.funding],
              ["Revenue", s.brief.enrichment.revenue],
              ["HQ", s.brief.enrichment.city],
              ["Founded", s.brief.enrichment.founded],
              ["Stack", Array.isArray(s.brief.enrichment.techStack) ? (s.brief.enrichment.techStack as string[]).slice(0, 5).join(", ") : undefined],
            ] as [string, unknown][]
          )
            .filter(([, v]) => v && !String(v).includes("mock"))
            .map(([k, v]) => (
              <span key={k} className="rounded-full border border-line bg-white px-3 py-1">
                <span className="text-muted">{k}</span> {String(v)}
              </span>
            ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Research: {s.brief.researchProvider} · Enrichment: {s.brief.enrichmentProvider} · Agent channel: {s.bandProvider}
      </p>

      <h2 className="mt-12 text-lg font-semibold">The buying committee</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {s.personas.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="relative -mx-5 -mt-5 mb-4 aspect-[4/3] overflow-hidden rounded-t-[20px]" style={{ background: `${EXEC_COLOR[p.id]}14` }}>
              {s.portraits?.[p.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/image?url=${encodeURIComponent(s.portraits[p.id]!)}`} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center">
                  <span className="grid h-20 w-20 place-items-center rounded-full text-2xl font-semibold text-white" style={{ background: EXEC_COLOR[p.id] }}>
                    {initials(p.name)}
                  </span>
                </div>
              )}
              <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-sm font-medium shadow-sm">{p.name}</span>
            </div>
            <p className="text-sm font-semibold">{p.title}</p>
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
