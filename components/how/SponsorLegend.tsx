import { SPONSOR_INFO, TAGS } from "./flow-data";

export default function SponsorLegend() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SPONSOR_INFO.map((s) => {
        const t = TAGS[s.key];
        return (
          <article key={s.key} className="card flex flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: t.color }}>
                {t.label}
              </h3>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink">{s.role}</p>
            <ul className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4">
              {s.uses.map((u) => (
                <li key={u.what} className="text-[13px] text-muted">
                  <span className="block">{u.what}</span>
                  <code className="mt-1 inline-block rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
                    {u.file}
                  </code>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
