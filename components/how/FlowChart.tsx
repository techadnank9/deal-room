"use client";

import { useMemo, useState } from "react";
import {
  EDGES,
  EXECS,
  LANES,
  NODES,
  SPONSOR_INFO,
  TAGS,
  type FlowEdge,
  type FlowNode,
  type SponsorKey,
} from "./flow-data";

// ---------- geometry (desktop canvas, in px) ----------
const GUTTER = 24;
const COL = 200;
const NW = 172;
const NH = 72;
const ROWP = 92;
const HEAD = 66;
const PADB = 34;
const GAP = 46;
const W = GUTTER * 2 + 5 * COL + NW;

type Rect = { x: number; y: number; w: number; h: number };

function laneLayout() {
  const tops: Record<string, { top: number; height: number }> = {};
  let y = 0;
  for (const lane of LANES) {
    const height = HEAD + lane.rows * ROWP - (ROWP - NH) + PADB;
    tops[lane.id] = { top: y, height };
    y += height + GAP;
  }
  return { tops, height: y - GAP };
}

const LAYOUT = laneLayout();

function rectOf(n: FlowNode): Rect {
  const span = n.span ?? 1;
  return {
    x: GUTTER + n.col * COL,
    y: LAYOUT.tops[n.lane].top + HEAD + n.row * ROWP,
    w: NW,
    h: NH + (span - 1) * ROWP,
  };
}

const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<string, FlowNode>;

type Pt = [number, number];

function edgePoints(e: FlowEdge): Pt[] {
  const s = rectOf(NODE_BY_ID[e.from]);
  const t = rectOf(NODE_BY_ID[e.to]);
  const scx = s.x + s.w / 2;
  const tcx = t.x + t.w / 2;
  if (e.route === "down") return [[scx, s.y + s.h], [tcx, t.y]];
  if (e.route === "up") return [[scx, s.y], [tcx, t.y + t.h]];
  if (e.route === "below") {
    const y = Math.max(s.y + s.h, t.y + t.h) + 18;
    return [[scx, s.y + s.h], [scx, y], [tcx, y], [tcx, t.y + t.h]];
  }
  const sx = s.x + s.w;
  const tx = t.x;
  let sy = s.y + s.h / 2;
  let ty = t.y + t.h / 2;
  if (s.h > NH && ty > s.y && ty < s.y + s.h) sy = ty;
  if (t.h > NH && sy > t.y && sy < t.y + t.h) ty = sy;
  if (sy === ty) return [[sx, sy], [tx, ty]];
  const mx = tx - (COL - NW) / 2;
  return [[sx, sy], [mx, sy], [mx, ty], [tx, ty]];
}

function roundedPath(p: Pt[], r = 9): string {
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [px, py] = p[i - 1];
    const [cx, cy] = p[i];
    const [nx, ny] = p[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = cx - ((cx - px) / d1) * rr;
    const ay = cy - ((cy - py) / d1) * rr;
    const bx = cx + ((nx - cx) / d2) * rr;
    const by = cy + ((ny - cy) / d2) * rr;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const last = p[p.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

// ---------- focus state ----------
function useFocus() {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sponsor, setSponsor] = useState<SponsorKey | null>(null);

  const focusId = hover ?? selected;
  const lit = useMemo(() => {
    const nodes = new Set<string>();
    const edges = new Set<number>();
    if (focusId) {
      nodes.add(focusId);
      EDGES.forEach((e, i) => {
        if (e.from === focusId || e.to === focusId) {
          edges.add(i);
          nodes.add(e.from);
          nodes.add(e.to);
        }
      });
    } else if (sponsor) {
      NODES.forEach((n) => n.tag === sponsor && nodes.add(n.id));
      EDGES.forEach((e, i) => {
        if (nodes.has(e.from) || nodes.has(e.to)) edges.add(i);
      });
    }
    return { nodes, edges, active: Boolean(focusId || sponsor) };
  }, [focusId, sponsor]);

  return { hover, setHover, selected, setSelected, sponsor, setSponsor, focusId, lit };
}

type Focus = ReturnType<typeof useFocus>;

// ---------- small pieces ----------
function Tag({ tag, className = "" }: { tag: FlowNode["tag"]; className?: string }) {
  const t = TAGS[tag];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${className}`}
      style={{ color: t.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: t.sponsor ? t.color : "transparent", border: t.sponsor ? "none" : `1px solid ${t.color}` }}
      />
      {t.label}
    </span>
  );
}

function FileChip({ file }: { file: string }) {
  return (
    <code className="inline-block rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
      {file}
    </code>
  );
}

function ExecChips({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex ${compact ? "flex-row flex-wrap gap-1.5" : "flex-col gap-1"}`}>
      {EXECS.map((x) => (
        <span
          key={x.key}
          className="flex items-center gap-2 rounded-md border bg-white px-2 py-[2px] text-[11.5px] font-medium"
          style={{ borderColor: `${x.color}40`, color: x.color }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
          {x.label}
        </span>
      ))}
    </div>
  );
}

function SponsorFilter({ f }: { f: Focus }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[13px] text-muted">Follow a sponsor</span>
      {SPONSOR_INFO.map((s) => {
        const t = TAGS[s.key];
        const on = f.sponsor === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              f.setSelected(null);
              f.setSponsor(on ? null : s.key);
            }}
            className="flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors"
            style={{
              borderColor: on ? t.color : "#e7e1d7",
              background: on ? `${t.color}12` : "#fff",
              color: on ? t.color : "#16140f",
            }}
            aria-pressed={on}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function neighbours(id: string) {
  const ins = EDGES.filter((e) => e.to === id).map((e) => NODE_BY_ID[e.from].title);
  const outs = EDGES.filter((e) => e.from === id).map((e) => NODE_BY_ID[e.to].title);
  return { ins, outs };
}

function NodeDetail({ node }: { node: FlowNode }) {
  const { ins, outs } = neighbours(node.id);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:gap-8">
      <div>
        <Tag tag={node.tag} />
        <h3 className="mt-1 text-[17px] font-semibold tracking-tight">{node.title}</h3>
        <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-muted">{node.detail}</p>
      </div>
      <div className="flex flex-col gap-2 text-[13px] md:min-w-[300px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-muted">Code</span>
          {node.files.map((f) => (
            <FileChip key={f} file={f} />
          ))}
        </div>
        {ins.length > 0 && (
          <div className="flex gap-1.5">
            <span className="w-12 shrink-0 text-muted">From</span>
            <span>{ins.join(", ")}</span>
          </div>
        )}
        {outs.length > 0 && (
          <div className="flex gap-1.5">
            <span className="w-12 shrink-0 text-muted">To</span>
            <span>{outs.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ f }: { f: Focus }) {
  if (f.focusId) return <NodeDetail node={NODE_BY_ID[f.focusId]} />;
  if (f.sponsor) {
    const info = SPONSOR_INFO.find((s) => s.key === f.sponsor)!;
    const t = TAGS[f.sponsor];
    const steps = NODES.filter((n) => n.tag === f.sponsor);
    return (
      <div>
        <Tag tag={f.sponsor} />
        <h3 className="mt-1 text-[17px] font-semibold tracking-tight">{info.role}</h3>
        <p className="mt-1.5 text-[14px] text-muted">
          Used in {steps.length} step{steps.length === 1 ? "" : "s"}:{" "}
          {steps.map((s, i) => (
            <span key={s.id}>
              <span style={{ color: t.color }} className="font-medium">
                {s.title}
              </span>
              {i < steps.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">How to read this</p>
      <h3 className="mt-1 text-[17px] font-semibold tracking-tight">
        Four phases, top to bottom. Each box is one real step in the code.
      </h3>
      <p className="mt-1.5 text-[14px] text-muted">
        Hover or click any box to see the file that runs it and what it connects to. Pick a sponsor above to light up
        every place it is used.
      </p>
    </div>
  );
}

// ---------- desktop canvas ----------
function Canvas({ f }: { f: Focus }) {
  return (
    <div className="relative mx-auto" style={{ width: W, height: LAYOUT.height }}>
      {LANES.map((lane) => {
        const { top, height } = LAYOUT.tops[lane.id];
        return (
          <div key={lane.id}>
            <div
              className="absolute left-0 rounded-[18px] border border-line bg-white/55"
              style={{ top, height, width: W }}
            />
            <div className="absolute flex items-baseline gap-3" style={{ top: top + 20, left: GUTTER, right: GUTTER }}>
              <span className="font-mono text-[12px] text-muted">{lane.index}</span>
              <span className="text-[16px] font-semibold tracking-tight">{lane.title}</span>
              <code className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11.5px] text-white">{lane.endpoint}</code>
              <span className="text-[13.5px] text-muted">{lane.blurb}</span>
            </div>
            {lane.handoff && (
              <div
                className="absolute flex items-center gap-3 text-[13px] text-muted"
                style={{ top: top + height, height: GAP, left: GUTTER + NW / 2 - 0.5 }}
              >
                <span className="relative h-full w-px bg-[#c9c0b2]">
                  <span className="absolute -bottom-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[6px] border-x-transparent border-t-[#c9c0b2]" />
                </span>
                <span>{lane.handoff}</span>
              </div>
            )}
          </div>
        );
      })}

      <svg className="pointer-events-none absolute inset-0" width={W} height={LAYOUT.height} aria-hidden>
        <defs>
          {(["off", "on"] as const).map((k) => (
            <marker
              key={k}
              id={`arr-${k}`}
              viewBox="0 0 10 10"
              refX="9.5"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M0,0.5 L10,5 L0,9.5 z" fill={k === "on" ? "#16140f" : "#b8ae9f"} />
            </marker>
          ))}
        </defs>
        {EDGES.map((e, i) => {
          const on = f.lit.edges.has(i);
          const dim = f.lit.active && !on;
          const pts = edgePoints(e);
          const k = on ? "on" : "off";
          const mid =
            e.label && pts.length === 4 ? [(pts[1][0] + pts[2][0]) / 2, pts[1][1]] : null;
          return (
            <g key={i} style={{ opacity: dim ? 0.22 : 1, transition: "opacity 150ms" }}>
              <path
                d={roundedPath(pts)}
                fill="none"
                stroke={on ? "#16140f" : "#b8ae9f"}
                strokeWidth={on ? 1.75 : 1.25}
                strokeDasharray={e.dashed ? "4 4" : undefined}
                markerEnd={`url(#arr-${k})`}
                markerStart={e.both ? `url(#arr-${k})` : undefined}
              />
              {mid && (
                <text
                  x={mid[0]}
                  y={mid[1] + 4}
                  textAnchor="middle"
                  className="font-sans"
                  fontSize="11.5"
                  fill={on ? "#16140f" : "#6f695f"}
                  stroke="#fbfaf7"
                  strokeWidth="6"
                  paintOrder="stroke"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {NODES.map((n) => {
        const r = rectOf(n);
        const t = TAGS[n.tag];
        const isFocus = f.focusId === n.id;
        const on = f.lit.nodes.has(n.id);
        const dim = f.lit.active && !on;
        return (
          <button
            key={n.id}
            type="button"
            onMouseEnter={() => f.setHover(n.id)}
            onMouseLeave={() => f.setHover(null)}
            onFocus={() => f.setHover(n.id)}
            onBlur={() => f.setHover(null)}
            onClick={() => {
              f.setSponsor(null);
              f.setSelected(f.selected === n.id ? null : n.id);
            }}
            className="absolute flex flex-col items-start rounded-[14px] border bg-white px-3 py-2.5 text-left outline-none transition-[opacity,box-shadow,border-color] duration-150"
            style={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              opacity: dim ? 0.38 : 1,
              borderColor: isFocus || (on && f.sponsor && !f.focusId) ? t.color : "#e7e1d7",
              boxShadow: isFocus
                ? `0 0 0 3px ${t.color}22, 0 8px 24px -10px rgba(40,30,20,.3)`
                : "0 1px 2px rgba(40,30,20,.05)",
            }}
          >
            <Tag tag={n.tag} />
            <span className="mt-1 text-[14px] font-semibold leading-tight tracking-tight">{n.title}</span>
            <span className="mt-0.5 text-[12px] leading-tight text-muted">{n.sub}</span>
            {n.execGroup && (
              <span className="mt-2 w-full">
                <ExecChips />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- mobile stacked list ----------
function StackedFlow({ f }: { f: Focus }) {
  return (
    <div className="flex flex-col gap-8">
      {LANES.map((lane) => {
        const nodes = NODES.filter((n) => n.lane === lane.id).sort((a, b) => a.col - b.col || a.row - b.row);
        return (
          <section key={lane.id}>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] text-muted">{lane.index}</span>
              <h3 className="text-[16px] font-semibold tracking-tight">{lane.title}</h3>
            </div>
            <code className="mt-1 inline-block rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11.5px] text-white">
              {lane.endpoint}
            </code>
            <p className="mt-1.5 text-[13.5px] text-muted">{lane.blurb}</p>
            <ol className="relative mt-4 flex flex-col gap-2.5 border-l border-[#c9c0b2] pl-4">
              {nodes.map((n) => {
                const t = TAGS[n.tag];
                const open = f.selected === n.id;
                const dim = f.sponsor && n.tag !== f.sponsor;
                return (
                  <li key={n.id} className="relative">
                    <span
                      className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-paper"
                      style={{ background: t.sponsor ? t.color : "#c9c0b2" }}
                    />
                    <button
                      type="button"
                      onClick={() => f.setSelected(open ? null : n.id)}
                      className="w-full rounded-[14px] border bg-white px-3.5 py-3 text-left transition-opacity"
                      style={{ borderColor: open ? t.color : "#e7e1d7", opacity: dim ? 0.4 : 1 }}
                      aria-expanded={open}
                    >
                      <Tag tag={n.tag} />
                      <span className="mt-0.5 block text-[15px] font-semibold tracking-tight">{n.title}</span>
                      <span className="block text-[13px] text-muted">{n.sub}</span>
                      {n.execGroup && (
                        <span className="mt-2 block">
                          <ExecChips compact />
                        </span>
                      )}
                      {open && (
                        <span className="mt-3 block border-t border-line pt-3">
                          <span className="block text-[13.5px] leading-relaxed text-muted">{n.detail}</span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {n.files.map((file) => (
                              <FileChip key={file} file={file} />
                            ))}
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            {lane.handoff && <p className="mt-4 text-[13px] italic text-muted">↓ {lane.handoff}</p>}
          </section>
        );
      })}
    </div>
  );
}

export default function FlowChart() {
  const f = useFocus();
  return (
    <div className="card p-5 sm:p-7">
      <SponsorFilter f={f} />
      <div className="mt-5 hidden min-h-[128px] rounded-[16px] border border-line bg-paper/60 px-5 py-4 lg:block">
        <DetailPanel f={f} />
      </div>
      <div className="mt-6 hidden overflow-x-auto pb-2 lg:block">
        <Canvas f={f} />
      </div>
      <div className="mt-6 lg:hidden">
        <StackedFlow f={f} />
      </div>
    </div>
  );
}
