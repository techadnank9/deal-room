// Static product visuals for the landing page. Pure HTML/CSS mirrors of real screens.

export const ROLES = {
  cfo: { label: "CFO", name: "Dana Whitfield", color: "#c2410c", tint: "#fbe6dc" },
  tech: { label: "Tech lead", name: "Ravi Menon", color: "#0f766e", tint: "#d8eeea" },
  procurement: { label: "Procurement", name: "Lena Ortiz", color: "#7c3aed", tint: "#ebe3fb" },
  analyst: { label: "Analyst", name: "Analyst", color: "#db2777", tint: "#fbe1ec" },
} as const;

type RoleKey = keyof typeof ROLES;

function Initial({ role, size = 28 }: { role: RoleKey; size?: number }) {
  const r = ROLES[role];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ background: r.color, width: size, height: size }}
    >
      {r.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}

function Eyebrow({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted">
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </div>
  );
}

/** Abstract portrait card: flat tinted backdrop, simple bust silhouette, name pill. */
export function PortraitCard({ role, className = "" }: { role: RoleKey; className?: string }) {
  const r = ROLES[role];
  return (
    <figure className={`card relative w-40 overflow-hidden p-2 md:w-44 ${className}`}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl" style={{ background: r.tint }}>
        <svg viewBox="0 0 100 125" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="78" cy="22" r="30" fill="#fff" opacity="0.45" />
          <path d="M14 125c2-30 18-44 36-44s34 14 36 44z" fill={r.color} opacity="0.9" />
          <rect x="43" y="66" width="14" height="18" rx="6" fill={r.color} opacity="0.55" />
          <ellipse cx="50" cy="50" rx="17" ry="20" fill={r.color} opacity="0.7" />
        </svg>
      </div>
      <span className="absolute left-4 top-4 rounded-full bg-white/80 px-2 py-0.5 font-mono text-xs uppercase tracking-wider" style={{ color: r.color }}>
        {r.label}
      </span>
      <figcaption className="absolute bottom-4 left-4 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
        {r.name}
      </figcaption>
    </figure>
  );
}

const READ = [
  { role: "cfo" as const, v: 62, d: +14 },
  { role: "tech" as const, v: 41, d: -9 },
  { role: "procurement" as const, v: 28, d: -3 },
];

export function RoomReadCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card w-72 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Eyebrow dot="#16a34a">Room read · live</Eyebrow>
        <span className="font-mono text-xs text-muted">04:12</span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {READ.map(({ role, v, d }) => {
          const r = ROLES[role];
          return (
            <li key={role} className="flex items-center gap-3">
              <Initial role={role} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold">{r.label}</span>
                  <span className={`font-mono ${d > 0 ? "text-green-700" : "text-accent"}`}>
                    {d > 0 ? "+" : "−"}
                    {Math.abs(d)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                  <div className="h-full rounded-full" style={{ width: `${v}%`, background: r.color }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FactCheckCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card w-80 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Eyebrow dot={ROLES.analyst.color}>Analyst · fact check</Eyebrow>
        <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-xs font-semibold text-white">BUSTED</span>
      </div>
      <p className="mt-3 text-base font-semibold leading-snug">“40% fewer bugs at 200 teams”</p>
      <p className="mt-2 text-sm text-muted text-pretty">No public source backs this number. Your own case study cites 18% at one team.</p>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" /> 3 sources searched
      </div>
    </div>
  );
}

export function VerifiedCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card w-72 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Eyebrow dot={ROLES.analyst.color}>Analyst · fact check</Eyebrow>
        <span className="rounded-full bg-green-700 px-2 py-0.5 font-mono text-xs font-semibold text-white">VERIFIED</span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-snug">“They raised a Series C last spring”</p>
      <p className="mt-1 text-xs text-muted">Matches the company press page, March filing.</p>
    </div>
  );
}

export function WhisperCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card w-72 p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <Initial role="tech" size={24} />
        <span className="text-xs text-muted">→</span>
        <Initial role="cfo" size={24} />
        <span className="ml-auto flex items-center gap-1 font-mono text-xs text-muted">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          private
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5" aria-hidden>
        <span className="h-2.5 w-full rounded-full bg-black/[0.08]" />
        <span className="h-2.5 w-3/4 rounded-full bg-black/[0.08]" />
      </div>
      <p className="mt-3 text-xs text-muted">Private message, revealed on the scorecard.</p>
    </div>
  );
}

export function VoteCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card w-80 p-4 ${className}`}>
      <Eyebrow>Vote · CFO</Eyebrow>
      <div className="mt-3 flex items-center gap-3">
        <Initial role="cfo" size={36} />
        <div>
          <p className="text-sm font-semibold">Dana Whitfield</p>
          <p className="text-xs text-muted">Votes to move forward</p>
        </div>
        <span className="ml-auto rounded-full bg-green-700/10 px-2 py-0.5 text-xs font-semibold text-green-800">Yes</span>
      </div>
      <div className="mt-3 rounded-xl bg-black/[0.04] p-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted">Line that decided it</p>
        <p className="mt-1 text-sm leading-snug">“Payback is two quarters on your current QA headcount, and you can cancel after the pilot.”</p>
      </div>
    </div>
  );
}

const LOG = [
  { t: "02:41", role: "procurement" as const, text: "Asked why you over the vendor they renewed in May" },
  { t: "03:05", role: "analyst" as const, text: "Flagged “40% fewer bugs” as unsupported" },
  { t: "03:58", role: "cfo" as const, text: "Conviction up after the payback answer" },
];

export function DecisionLogCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card w-80 p-4 ${className}`}>
      <Eyebrow>Decision log</Eyebrow>
      <ol className="mt-3 flex flex-col gap-3">
        {LOG.map((l) => (
          <li key={l.t} className="flex gap-3 text-sm">
            <span className="w-10 shrink-0 font-mono text-xs leading-5 text-muted">{l.t}</span>
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ROLES[l.role].color }} />
            <span className="leading-snug">{l.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Larger scorecard mock used in the scorecard section. */
export function ScorecardMock() {
  const votes = [
    { role: "cfo" as const, vote: "Yes", line: "“Payback is two quarters on your current QA headcount.”" },
    { role: "tech" as const, vote: "No", line: "“It plugs into whatever CI you run.” He asked which. You didn’t know." },
    { role: "procurement" as const, vote: "No", line: "“We’re cheaper than the incumbent.” No number given." },
  ];
  const fixes = [
    "Name their CI provider before the tech lead asks",
    "Replace the 40% claim with the 18% you can source",
    "Bring a price against the vendor they renewed",
  ];
  const weak = [
    { k: "Integration", v: 72 },
    { k: "Pricing", v: 58 },
    { k: "Proof", v: 41 },
    { k: "Payback", v: 17 },
  ];
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted">Scorecard · session 7</p>
          <p className="text-lg font-semibold">Halden Logistics · QA agent pitch</p>
        </div>
        <span className="rounded-full bg-ink px-3 py-1 text-sm font-semibold text-white">1 of 3 voted yes</span>
      </div>
      <div className="grid gap-px bg-line md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4 bg-white p-6">
          {votes.map((v) => {
            const r = ROLES[v.role];
            return (
              <div key={v.role} className="flex gap-3">
                <Initial role={v.role} size={32} />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{r.label}</span>{" "}
                    <span className={v.vote === "Yes" ? "font-semibold text-green-700" : "font-semibold text-accent"}>{v.vote}</span>
                  </p>
                  <p className="mt-1 text-sm leading-snug text-muted text-pretty">{v.line}</p>
                </div>
              </div>
            );
          })}
          <div className="rounded-xl bg-black/[0.04] p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-muted">Whisper revealed · Tech lead to CFO</p>
            <p className="mt-1 text-sm leading-snug">“He dodged the CI question twice. I’m not signing off on an integration nobody owns.”</p>
          </div>
        </div>
        <div className="flex flex-col gap-6 bg-white p-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted">Three things to fix</p>
            <ol className="mt-3 flex flex-col gap-2">
              {fixes.map((f, i) => (
                <li key={f} className="flex gap-3 text-sm leading-snug">
                  <span className="font-mono text-accent">0{i + 1}</span>
                  {f}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted">Objections that beat you, last 7 sessions</p>
            <ul className="mt-3 flex flex-col gap-2">
              {weak.map((w) => (
                <li key={w.k} className="grid grid-cols-[88px_1fr_32px] items-center gap-2 text-sm">
                  <span>{w.k}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${w.v}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs text-muted">{w.v}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
