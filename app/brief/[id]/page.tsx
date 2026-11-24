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
  const [more, setMore] = useState(false);
  const [tab, setTab] = useState("How to pitch them");

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      api<{ session: SessionState }>(`/api/session?id=${id}`)
        .then((r) => {
          setS(r.session);
          // Portraits are generated in the background; refresh until they land.
          if (r.session.imagesPending && tries++ < 12)
            timer = setTimeout(load, 3000);
        })
        .catch((e) => setErr(String(e)));
    load();
    return () => clearTimeout(timer);
  }, [id]);

  if (err) return <p className="p-10 text-red-600">{err}</p>;
  if (!s) return <p className="p-10 text-muted">Loading brief…</p>;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.18em] text-accent">
        Account brief
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.02em]">
        {s.brief.company}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {s.brief.domain} · pitching: {s.offering}
      </p>
      <p
        className={`mt-6 max-w-3xl leading-relaxed text-ink/80 ${more ? "" : "line-clamp-2"}`}
      >
        {s.brief.summary}
      </p>
      <button
        onClick={() => setMore((m) => !m)}
        className="mt-1 text-xs text-muted underline"
      >
        {more ? "Less" : "Read more"}
      </button>

      {s.brief.enrichment && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ["Employees", s.brief.enrichment.employees],
              ["Revenue", s.brief.enrichment.revenue],
              ["Funding", s.brief.enrichment.funding],
              ["Founded", s.brief.enrichment.founded],
              ["HQ", s.brief.enrichment.city],
            ] as [string, unknown][]
          )
            .filter(([, v]) => v && !String(v).includes("mock"))
            .map(([k, v]) => (
              <div key={k} className="card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
                  {k}
                </p>
                <p
                  className="mt-1 truncate text-xl font-semibold tracking-tight"
                  title={String(v)}
                >
                  {String(v)}
                </p>
              </div>
            ))}
        </div>
      )}
      {Array.isArray(s.brief.enrichment?.techStack) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-muted">Stack</span>
          {(s.brief.enrichment.techStack as string[]).slice(0, 8).map((x) => (
            <span
              key={x}
              className="rounded-full border border-line bg-white px-2.5 py-0.5"
            >
              {x}
            </span>
          ))}
        </div>
      )}

      {s.brief.facts.length > 0 && (
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {s.brief.facts.map((f, i) => (
            <a
              key={i}
              href={f.sourceUrl || undefined}
              target="_blank"
              className="card group block p-4 text-sm transition hover:-translate-y-0.5 hover:border-ink"
            >
              <p className="line-clamp-3 leading-snug">{f.text}</p>
              {f.sourceUrl && (
                <p className="mt-2 truncate text-[11px] text-muted group-hover:text-ink">
                  ↗{" "}
                  {
                    f.sourceUrl
                      .replace(/^https?:\/\/(www\.)?/, "")
                      .split("/")[0]
                  }
                </p>
              )}
            </a>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Research: {s.brief.researchProvider} · Enrichment:{" "}
        {s.brief.enrichmentProvider} · Agent channel: {s.bandProvider}
      </p>

      {s.brief.steps && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">
            How we researched {s.brief.company}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Click a step to see exactly what it returned.
          </p>
          <ol className="mt-4 space-y-2">
            {s.brief.steps.map((st, i) => (
              <li key={i} className="card text-sm">
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium">{st.label}</span>
                    <span className="text-xs text-muted">{st.provider}</span>
                    <span
                      className={`w-28 text-right text-xs font-semibold ${st.found ? "text-emerald-700" : "text-muted"}`}
                    >
                      {st.found} found · {(st.ms / 1000).toFixed(1)}s
                    </span>
                    <span className="text-muted transition group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <StepData label={st.label} s={s} />
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}

      {s.brief.breakdown && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Business breakdown</h2>
          <p className="mt-2 line-clamp-3 max-w-3xl leading-relaxed text-ink/85">
            {s.brief.breakdown.overview}
          </p>
          {(() => {
            const sections = (
              [
                ["What they sell", s.brief.breakdown.whatTheySell],
                ["Customers", s.brief.breakdown.customers],
                ["Business model", s.brief.breakdown.businessModel],
                ["Funding", s.brief.breakdown.funding],
                ["Team and hiring", s.brief.breakdown.teamAndHiring],
                ["Recent news", s.brief.breakdown.recentNews],
                ["Strategic priorities", s.brief.breakdown.strategicPriorities],
                ["Risks", s.brief.breakdown.risks],
                ["Buying triggers", s.brief.breakdown.buyingTriggers],
                ["How to pitch them", s.brief.breakdown.howToPitch],
              ] as [string, { text: string; sourceUrl: string }[]][]
            ).filter(([, items]) => items?.length);
            const cur = sections.find(([t]) => t === tab) ?? sections[0];
            return (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  {sections.map(([title, items]) => (
                    <button
                      key={title}
                      onClick={() => setTab(title)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${cur?.[0] === title ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
                    >
                      {title} <span className="opacity-60">{items.length}</span>
                    </button>
                  ))}
                </div>
                {cur && (
                  <div
                    key={cur[0]}
                    className="rise mt-4 grid gap-3 md:grid-cols-2"
                  >
                    {cur[1].map((it, i) => (
                      <div
                        key={i}
                        className={`card p-4 text-sm ${cur[0] === "How to pitch them" ? "border-2 border-accent/40" : ""}`}
                      >
                        <p className="leading-snug">{it.text}</p>
                        {it.sourceUrl && (
                          <a
                            href={it.sourceUrl}
                            target="_blank"
                            className="mt-2 inline-block text-[11px] text-muted hover:text-ink"
                          >
                            ↗{" "}
                            {
                              it.sourceUrl
                                .replace(/^https?:\/\/(www\.)?/, "")
                                .split("/")[0]
                            }
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </section>
      )}

      <h2 className="mt-12 text-lg font-semibold">The buying committee</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {s.personas.map((p) => (
          <div key={p.id} className="card p-5">
            <div
              className="relative -mx-5 -mt-5 mb-4 aspect-[4/3] overflow-hidden rounded-t-[20px]"
              style={{ background: `${EXEC_COLOR[p.id]}14` }}
            >
              {s.portraits?.[p.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/image?url=${encodeURIComponent(s.portraits[p.id]!)}`}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center">
                  <span
                    className="grid h-20 w-20 place-items-center rounded-full text-2xl font-semibold text-white"
                    style={{ background: EXEC_COLOR[p.id] }}
                  >
                    {initials(p.name)}
                  </span>
                </div>
              )}
              <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-sm font-medium shadow-sm">
                {p.name}
              </span>
            </div>
            <p className="text-sm font-semibold">{p.title}</p>
            <p className="mt-3 text-sm italic text-muted">{p.personality}</p>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted">
              Priorities
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {p.priorities.map((x) => (
                <li key={x}>• {x}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted">
              Will push back on
            </p>
            <ul className="mt-1 space-y-1 text-sm text-ink/80">
              {p.objections.map((o) => (
                <li key={o.text}>
                  “{o.text}”{" "}
                  {o.sourceUrl && (
                    <a
                      href={o.sourceUrl}
                      target="_blank"
                      className="text-xs text-muted underline"
                    >
                      src
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Starting conviction: {p.conviction}/100
            </p>
          </div>
        ))}
      </div>

      <Link href={`/room/${s.id}`} className="pill-dark mt-10">
        Enter the room <span className="arrow">→</span>
      </Link>
    </main>
  );
}

type Item = { title: string; url?: string; detail?: string };

/** The actual data each research step returned. */
function StepData({ label, s }: { label: string; s: SessionState }) {
  const b = s.brief;
  const byKind = (k: string) =>
    b.sources
      .filter((x) => (x.kind ?? "site") === k)
      .map((x) => ({ title: x.title || x.url, url: x.url, detail: x.snippet }));
  let items: Item[] = [];
  if (/Telem fetch/.test(label)) items = byKind("site");
  else if (/news/i.test(label)) items = byKind("news");
  else if (/hiring/i.test(label)) items = byKind("hiring");
  else if (/funding and customers/i.test(label)) items = byKind("funding");
  else if (/Glasser/.test(label))
    items = Object.entries(b.enrichment ?? {})
      .filter(
        ([, v]) =>
          (v !== null &&
            v !== undefined &&
            v !== "" &&
            !(Array.isArray(v) && !v.length) &&
            typeof v !== "object") ||
          Array.isArray(v),
      )
      .map(([k, v]) => ({
        title: k
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (c) => c.toUpperCase()),
        detail: Array.isArray(v)
          ? v
              .map((x) =>
                typeof x === "object"
                  ? Object.values(x as object)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(" · ")
                  : String(x),
              )
              .slice(0, 8)
              .join(", ")
          : String(v),
      }));
  else if (/Research your company/.test(label))
    items = (b.seller?.sources ?? []).map((x) => ({
      title: x.title || x.url,
      url: x.url,
      detail: x.snippet,
    }));
  else if (/breakdown/i.test(label) && b.breakdown)
    items = Object.entries(b.breakdown)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => ({
        title: k
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (c) => c.toUpperCase()),
        detail: (v as unknown[]).map(String).join(" · "),
      }));
  else if (/committee/i.test(label))
    items = s.personas.map((p) => ({
      title: `${p.name}, ${p.title}`,
      detail: p.priorities.join(" · "),
    }));
  if (!items.length)
    return (
      <p className="mt-2 pl-11 text-xs text-muted">
        Nothing came back for this step.
      </p>
    );
  return (
    <ul className="mt-3 space-y-2 border-l border-line pl-4 ml-3.5">
      {items.map((it, j) => (
        <li key={j} className="text-xs">
          {it.url ? (
            <a
              href={it.url}
              target="_blank"
              className="font-semibold underline decoration-line underline-offset-2 hover:decoration-ink"
            >
              {it.title}
            </a>
          ) : (
            <span className="font-semibold">{it.title}</span>
          )}
          {it.url && (
            <span className="ml-2 text-muted">
              {it.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}
            </span>
          )}
          {it.detail && (
            <p className="mt-0.5 line-clamp-3 text-ink/75">{it.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
