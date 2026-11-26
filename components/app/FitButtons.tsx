"use client";
// Good fit / Not a fit: the seller's verdict on a lead. The agent reads these when it picks new companies.
import { useState } from "react";
import { post } from "./ui";

const REASONS = ["Wrong company type", "Wrong size or location", "Wrong person or title", "Already a customer or known", "Competitor", "Signal not relevant"];

export default function FitButtons({ leadId, current, onDone }: { leadId: string; current?: { fit: "good" | "bad"; reason?: string }; onDone?: () => void | Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  async function mark(fit: "good" | "bad", reason?: string) {
    setBusy(true);
    try {
      await post("/api/gtm", { action: "fit", leadId, fit, reason });
      setAsking(false);
      await onDone?.();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted">{current ? (current.fit === "good" ? "You marked this a good fit." : `You marked this not a fit${current.reason ? ` (${current.reason})` : ""}.`) : "Teach your agent:"}</span>
      {!asking ? (
        <>
          <button disabled={busy} onClick={() => void mark("good")} className={`rounded-full border px-2.5 py-1 ${current?.fit === "good" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-line bg-white hover:border-ink"}`}>
            👍 Good fit
          </button>
          <button disabled={busy} onClick={() => setAsking(true)} className={`rounded-full border px-2.5 py-1 ${current?.fit === "bad" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-line bg-white hover:border-ink"}`}>
            👎 Not a fit
          </button>
        </>
      ) : (
        <>
          {REASONS.map((r) => (
            <button key={r} disabled={busy} onClick={() => void mark("bad", r)} className="rounded-full border border-line bg-white px-2.5 py-1 hover:border-rose-400">
              {r}
            </button>
          ))}
          <button onClick={() => setAsking(false)} className="px-1.5 text-muted hover:text-ink">
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
