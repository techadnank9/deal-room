"use client";

import { useEffect, useRef } from "react";
import { ACTOR_COLOR } from "@/lib/ui";

export type LogEntry = {
  key: string;
  turn: number;
  actor: string;
  action: string;
  detail?: string;
  reason?: string;
  hidden?: boolean;
  tone?: "good" | "bad" | "neutral";
};

const TONE: Record<string, string> = { good: "text-emerald-700", bad: "text-red-600", neutral: "text-ink" };

export default function DecisionLog({ entries }: { entries: LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView returns a Promise in newer browsers; never return it from the effect.
    void end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries.length]);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-muted">Decision log</div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[13px]">
        {entries.length === 0 && <p className="p-2 text-muted">Every thought, vote and fact check lands here.</p>}
        {entries.map((e) => (
          <div key={e.key} className="rise rounded-xl px-2.5 py-2 hover:bg-black/[0.03]">
            <div className="flex items-center gap-2 text-xs">
              <span className="tabular-nums text-muted">T{e.turn}</span>
              <span className="font-semibold uppercase tracking-wide" style={{ color: ACTOR_COLOR[e.actor] ?? "#16140f" }}>
                {e.actor}
              </span>
              <span className={`font-medium ${TONE[e.tone ?? "neutral"]}`}>{e.action}</span>
            </div>
            {e.detail && (
              <p className={`mt-0.5 leading-snug ${e.hidden ? "italic text-muted" : "text-ink/85"}`}>
                {e.hidden ? "Private message, revealed on the scorecard" : e.detail}
              </p>
            )}
            {e.reason && <p className="mt-0.5 text-xs leading-snug text-muted">Why: {e.reason}</p>}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
