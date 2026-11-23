"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DecisionLog, { type LogEntry } from "@/components/room/DecisionLog";

const Scene = dynamic(() => import("@/components/room/Scene"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-zinc-500">Building the room…</div>,
});
import { api, EXEC_COLOR, EXEC_LABEL } from "@/lib/ui";
import {
  MAX_TURNS,
  type ClaimCheck,
  type ExecId,
  type Gesture,
  type SessionState,
  type TurnResponse,
  type Vote,
} from "@/lib/types";

type Line = { speaker: string; text: string };

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<SessionState | null>(null);
  const [convictions, setConvictions] = useState<Record<string, number>>({});
  const [gestures, setGestures] = useState<Record<string, Gesture>>({});
  const [speaker, setSpeaker] = useState<ExecId | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastCheck, setLastCheck] = useState<ClaimCheck | null>(null);
  const [turn, setTurn] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [votes, setVotes] = useState<Vote[] | null>(null);
  const [err, setErr] = useState("");
  const [gestureUntil, setGestureUntil] = useState(0);
  const [whispers, setWhispers] = useState<{ from: string; to: string }[]>([]);
  const [userTalking, setUserTalking] = useState(false);
  const logKey = useRef(0);
  const turnRef = useRef(0);
  const linesEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);
  useEffect(() => {
    void linesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  const push = useCallback((entries: Omit<LogEntry, "key">[]) => {
    setLog((l) => [...l, ...entries.map((e) => ({ ...e, key: String(logKey.current++) }))]);
  }, []);

  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api<{ session: SessionState }>(`/api/session?id=${id}`)
      .then(({ session }) => {
        setS(session);
        setTurn(session.turn);
        setConvictions(Object.fromEntries(session.personas.map((p) => [p.id, p.conviction])));
        setLines(session.transcript.map((t) => ({ speaker: t.speaker, text: t.text })));
        if (session.status === "finished") router.replace(`/score/${id}`);
        push(
          session.personas.map((p) => ({
            turn: 0,
            actor: p.id,
            action: `enters the room at ${p.conviction}/100`,
            detail: `${p.name}, ${p.title}`,
          })),
        );
      })
      .catch((e) => setErr(String(e)));
  }, [id, push, router]);

  const verdict = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api<{ votes: Vote[] }>("/api/verdict", { id });
      setVotes(r.votes);
      push(
        r.votes.map((v) => ({
          turn: turnRef.current,
          actor: v.id,
          action: v.vote === "buy" ? "votes BUY" : "votes PASS",
          tone: v.vote === "buy" ? "good" : "bad",
          reason: `${v.reason} (decided on turn ${v.decisiveTurn})`,
        })),
      );
      setTimeout(() => router.push(`/score/${id}`), 7000);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }, [id, push, router]);

  async function send(utterance: string) {
    if (!utterance.trim() || busy || !s) return;
    setBusy(true);
    setErr("");
    setSpeaker(null);
    setUserTalking(true);
    setLines((l) => [...l, { speaker: "user", text: utterance }]);
    try {
      const r = await api<TurnResponse>("/api/turn", { id, text: utterance });
      setTurn(r.turn);
      setConvictions(r.convictions);
      setGestures(r.gestures);
      setGestureUntil(performance.now() + 2800);
      setUserTalking(false);
      setSpeaker(r.speaker);
      if (r.whisperPairs.length) {
        setWhispers(r.whisperPairs);
        setTimeout(() => setWhispers([]), 3800);
      }
      setLines((l) => [...l, { speaker: r.speaker, text: r.spokenLine }]);
      if (r.factChecks.length) setLastCheck(r.factChecks[r.factChecks.length - 1]);
      const entries: Omit<LogEntry, "key">[] = [{ turn: r.turn, actor: "user", action: "pitches", detail: utterance }];
      for (const c of r.factChecks) {
        entries.push({
          turn: r.turn,
          actor: "analyst",
          action: `fact check: ${c.status}`,
          tone: c.status === "verified" ? "good" : "bad",
          detail: c.claim,
          reason: `${c.note}${c.sourceUrl ? ` (${c.sourceUrl})` : ""}`,
        });
      }
      for (const p of s.personas) {
        const t = r.thoughts[p.id];
        entries.push({
          turn: r.turn,
          actor: p.id,
          action: `conviction ${t.delta >= 0 ? "+" : ""}${t.delta} → ${r.convictions[p.id]} · ${r.gestures[p.id]}`,
          tone: t.delta > 0 ? "good" : t.delta < 0 ? "bad" : "neutral",
          detail: `thinks: ${t.privateThought}`,
          reason: t.reason,
        });
      }
      for (const w of r.whisperPairs) {
        entries.push({ turn: r.turn, actor: w.from, action: `whispers to ${w.to}`, detail: "hidden", hidden: true });
      }
      entries.push({
        turn: r.turn,
        actor: "director",
        action: `gives the floor to ${r.speaker} (urge ${r.thoughts[r.speaker].urge}/10)`,
      });
      push(entries);
      setText("");
      setBusy(false);
      if (r.done) await verdict();
    } catch (e) {
      setErr(String(e));
      setUserTalking(false);
      setBusy(false);
    }
  }

  if (err && !s) return <p className="p-10 text-red-400">{err}</p>;
  if (!s) return <p className="p-10 text-zinc-400">Opening the room…</p>;

  return (
    <main className="flex h-screen w-full overflow-hidden">
      <section className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div>
            <span className="font-semibold">{s.brief.company}</span>
            <span className="ml-3 text-sm text-zinc-500">
              Turn {turn}/{MAX_TURNS}
            </span>
          </div>
          <button
            onClick={verdict}
            disabled={busy || turn === 0 || !!votes}
            className="rounded-md border border-red-500/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          >
            End call & vote
          </button>
        </header>

        <div className="relative h-[58vh] min-h-[360px] border-b border-zinc-800">
          <Scene
            execs={s.personas.map((p) => ({
              id: p.id,
              name: p.name,
              role: EXEC_LABEL[p.id],
              color: EXEC_COLOR[p.id],
              conviction: convictions[p.id] ?? p.conviction,
            }))}
            gestures={gestures}
            gestureUntil={gestureUntil}
            speaker={speaker}
            userTalking={userTalking}
            whispers={whispers}
            votes={votes}
            check={lastCheck}
            analystBusy={busy && userTalking}
          />
          {votes && (
            <div className="pointer-events-none absolute inset-x-0 top-4 text-center text-2xl font-semibold">
              {votes.filter((v) => v.vote === "buy").length >= 2 ? (
                <span className="text-emerald-400">Deal won — buyers coming over to shake hands</span>
              ) : (
                <span className="text-red-400">Deal lost — the committee is walking out</span>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {lines.length === 0 && (
            <p className="text-zinc-500">The committee is seated. Open with your pitch — be specific, they will check your numbers.</p>
          )}
          {lines.map((l, i) => {
            const p = s.personas.find((x) => x.id === l.speaker);
            return (
              <div key={i} className={l.speaker === "user" ? "text-right" : ""}>
                <span className="text-xs" style={{ color: p ? EXEC_COLOR[p.id] : "#34d399" }}>
                  {p ? `${p.name} (${EXEC_LABEL[p.id]})` : "You"}
                </span>
                <p
                  className={`mt-1 inline-block max-w-[80%] rounded-lg px-4 py-2 ${l.speaker === "user" ? "bg-emerald-500/10" : "bg-zinc-800/70"}`}
                >
                  {l.text}
                </p>
              </div>
            );
          })}
          {busy && <p className="text-sm text-zinc-500">The committee is thinking…</p>}
          <div ref={linesEnd} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex gap-3 border-t border-zinc-800 p-4"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy || !!votes}
            placeholder="Say your next line…"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-amber-400"
          />
          <button disabled={busy || !!votes} className="rounded-lg bg-amber-400 px-5 font-medium text-black disabled:opacity-50">
            Say it
          </button>
        </form>
        {err && <p className="px-4 pb-3 text-sm text-red-400">{err}</p>}
      </section>
      <aside className="w-[380px] border-l border-zinc-800 bg-[#0d1017]">
        <DecisionLog entries={log} />
      </aside>
    </main>
  );
}
