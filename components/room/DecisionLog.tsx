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

const TONE: Record<string, string> = { good: "text-emerald-400", bad: "text-red-400", neutral: "text-zinc-300" };

export default function DecisionLog({ entries }: { entries: LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView returns a Promise in newer browsers; never return it from the effect.
    void end.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-4 py-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Decision log</div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {entries.length === 0 && <p className="text-zinc-600">Every thought, vote and fact check lands here.</p>}
        {entries.map((e) => (
          <div key={e.key} className="rounded-md border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-600">T{e.turn}</span>
              <span className="font-semibold uppercase" style={{ color: ACTOR_COLOR[e.actor] ?? "#ddd" }}>
                {e.actor}
              </span>
              <span className={TONE[e.tone ?? "neutral"]}>{e.action}</span>
            </div>
            {e.detail && (
              <p className={`mt-1 ${e.hidden ? "select-none italic text-zinc-600" : "text-zinc-300"}`}>
                {e.hidden ? "🔒 private message — revealed on the scorecard" : e.detail}
              </p>
            )}
            {e.reason && <p className="mt-1 text-xs text-zinc-500">why: {e.reason}</p>}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
