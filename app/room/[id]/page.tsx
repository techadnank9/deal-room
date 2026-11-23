"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DecisionLog, { type LogEntry } from "@/components/room/DecisionLog";
import { api, EXEC_COLOR, EXEC_LABEL, initials } from "@/lib/ui";
import { speak, stopSpeaking, usePushToTalk } from "@/lib/voice";
import { MAX_TURNS, type ClaimCheck, type ExecId, type Gesture, type SessionState, type TurnResponse, type Vote } from "@/lib/types";

const Scene = dynamic(() => import("@/components/room/Scene"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted">Setting up the room…</div>,
});

type Caption = { who: string; text: string; key: number };

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<SessionState | null>(null);
  const [convictions, setConvictions] = useState<Record<string, number>>({});
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [gestures, setGestures] = useState<Record<string, Gesture>>({});
  const [speaker, setSpeaker] = useState<ExecId | null>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastCheck, setLastCheck] = useState<ClaimCheck | null>(null);
  const [checkKey, setCheckKey] = useState(0);
  const [turn, setTurn] = useState(0);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [votes, setVotes] = useState<Vote[] | null>(null);
  const [err, setErr] = useState("");
  const [gestureUntil, setGestureUntil] = useState(0);
  const [whispers, setWhispers] = useState<{ from: string; to: string }[]>([]);
  const [userTalking, setUserTalking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const mutedRef = useRef(false);
  const logKey = useRef(0);
  const turnRef = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) stopSpeaking();
  }, [muted]);
  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  const push = useCallback((entries: Omit<LogEntry, "key">[]) => {
    setLog((l) => [...l, ...entries.map((e) => ({ ...e, key: String(logKey.current++) }))]);
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api<{ session: SessionState }>(`/api/session?id=${id}`)
      .then(({ session }) => {
        if (session.status === "finished") return router.replace(`/score/${id}`);
        setS(session);
        setTurn(session.turn);
        setConvictions(Object.fromEntries(session.personas.map((p) => [p.id, p.conviction])));
        push(
          session.personas.map((p) => ({
            turn: 0,
            actor: p.id,
            action: `walks in at ${p.conviction}/100`,
            detail: `${p.name}, ${p.title}`,
          })),
        );
      })
      .catch((e) => setErr(String(e)));
  }, [id, push, router]);

  const verdict = useCallback(async () => {
    setBusy(true);
    stopSpeaking();
    try {
      const r = await api<{ votes: Vote[] }>("/api/verdict", { id });
      setVotes(r.votes);
      setSpeaker(null);
      setCaption(null);
      push(
        r.votes.map((v) => ({
          turn: turnRef.current,
          actor: v.id,
          action: v.vote === "buy" ? "votes BUY" : "votes PASS",
          tone: v.vote === "buy" ? "good" : "bad",
          reason: `${v.reason} (decided on turn ${v.decisiveTurn})`,
        })),
      );
      setTimeout(() => router.push(`/score/${id}`), 7500);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }, [id, push, router]);

  async function send(utterance: string) {
    if (!utterance.trim() || busy || !s || votes) return;
    setBusy(true);
    setErr("");
    setSpeaker(null);
    setUserTalking(true);
    setCaption({ who: "You", text: utterance, key: Date.now() });
    try {
      const r = await api<TurnResponse>("/api/turn", { id, text: utterance });
      setTurn(r.turn);
      setDeltas(Object.fromEntries(Object.entries(r.thoughts).map(([k, t]) => [k, t.delta])));
      setConvictions(r.convictions);
      setGestures(r.gestures);
      setGestureUntil(performance.now() + 2800);
      setUserTalking(false);
      setSpeaker(r.speaker);
      setCaption({ who: r.speaker, text: r.spokenLine, key: Date.now() });
      if (!mutedRef.current) {
        const who = r.speaker;
        speak(r.spokenLine, who, () => setSpeaker((cur) => (cur === who ? null : cur)));
      }
      if (r.whisperPairs.length) {
        setWhispers(r.whisperPairs);
        setTimeout(() => setWhispers([]), 3800);
      }
      if (r.factChecks.length) {
        setLastCheck(r.factChecks[r.factChecks.length - 1]);
        setCheckKey((k) => k + 1);
      }
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
          action: `${t.delta >= 0 ? "+" : ""}${t.delta} → ${r.convictions[p.id]} · ${r.gestures[p.id]}`,
          tone: t.delta > 0 ? "good" : t.delta < 0 ? "bad" : "neutral",
          detail: `thinks: ${t.privateThought}`,
          reason: t.reason,
        });
      }
      for (const w of r.whisperPairs) entries.push({ turn: r.turn, actor: w.from, action: `whispers to ${w.to}`, detail: "hidden", hidden: true });
      entries.push({ turn: r.turn, actor: "director", action: `floor to ${r.speaker} (urge ${r.thoughts[r.speaker].urge}/10)` });
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

  const ptt = usePushToTalk((said) => void send(said), !!s && !busy && !votes && !typing);

  if (err && !s) return <p className="p-10 text-red-600">{err}</p>;
  if (!s) return <p className="p-10 text-muted">Opening the room…</p>;

  const live = ptt.listening ? { who: "You", text: ptt.interim || "…", key: -1 } : caption;
  const captionPersona = live && s.personas.find((p) => p.id === live.who);
  const buys = votes?.filter((v) => v.vote === "buy").length ?? 0;

  return (
    <main className="relative h-screen w-full overflow-hidden bg-paper">
      <div className="absolute inset-0">
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
          userTalking={userTalking || ptt.listening}
          whispers={whispers}
          votes={votes}
          check={lastCheck}
          analystBusy={busy && userTalking}
        />
      </div>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div className="card pointer-events-auto flex items-center gap-3 px-4 py-2.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-semibold">{s.brief.company}</span>
          <span className="text-sm text-muted">
            Turn {turn} of {MAX_TURNS}
          </span>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button onClick={() => setMuted((m) => !m)} className="card px-4 py-2.5 text-sm">
            {muted ? "Voices off" : "Voices on"}
          </button>
          <button onClick={() => setLogOpen((o) => !o)} className="card px-4 py-2.5 text-sm">
            {logOpen ? "Hide log" : "Decision log"}
          </button>
          <button onClick={verdict} disabled={busy || turn === 0 || !!votes} className="pill-dark text-sm disabled:opacity-40">
            End call & vote
            <span className="arrow">→</span>
          </button>
        </div>
      </div>

      {/* room read */}
      <div className="card absolute left-5 top-24 w-72 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">The room</p>
        <div className="mt-3 space-y-3">
          {s.personas.map((p) => {
            const c = convictions[p.id] ?? p.conviction;
            const d = deltas[p.id];
            const vote = votes?.find((v) => v.id === p.id);
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl p-1.5 transition ${speaker === p.id ? "bg-black/[0.04]" : ""}`}>
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ background: EXEC_COLOR[p.id] }}
                >
                  {initials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {vote ? (
                      <span className={`text-xs font-bold ${vote.vote === "buy" ? "text-emerald-600" : "text-red-600"}`}>
                        {vote.vote.toUpperCase()}
                      </span>
                    ) : d !== undefined ? (
                      <span className={`text-xs font-semibold tabular-nums ${d > 0 ? "text-emerald-600" : d < 0 ? "text-red-600" : "text-muted"}`}>
                        {d > 0 ? "+" : ""}
                        {d}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted">{EXEC_LABEL[p.id]}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c}%`, background: EXEC_COLOR[p.id] }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* fact check toast */}
      {lastCheck && !votes && (
        <div key={checkKey} className="card rise absolute left-1/2 top-20 w-[min(560px,60vw)] -translate-x-1/2 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: "#db2777" }} />
            Analyst checked your claim
          </div>
          <div className="mt-1.5 flex items-start gap-3">
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                lastCheck.status === "verified"
                  ? "bg-emerald-100 text-emerald-700"
                  : lastCheck.status === "contradicted"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {lastCheck.status === "contradicted" ? "BUSTED" : lastCheck.status.toUpperCase()}
            </span>
            <div className="text-sm">
              <p className="line-clamp-2">{lastCheck.claim}</p>
              <p className="mt-0.5 text-xs text-muted">{lastCheck.note}</p>
            </div>
          </div>
        </div>
      )}

      {/* verdict banner */}
      {votes && (
        <div className="card rise absolute left-1/2 top-20 -translate-x-1/2 px-8 py-5 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Verdict</p>
          <p className={`mt-1 text-3xl font-semibold tracking-tight ${buys >= 2 ? "text-emerald-700" : "text-red-600"}`}>
            {buys >= 2 ? `Deal won, ${buys} to ${3 - buys}` : `Deal lost, ${buys} to ${3 - buys}`}
          </p>
          <p className="mt-1 text-sm text-muted">{buys >= 2 ? "The buyers are coming over to shake hands." : "The committee is walking out."}</p>
        </div>
      )}

      {/* decision log */}
      {logOpen && (
        <aside className="card absolute bottom-28 right-5 top-24 w-[360px] overflow-hidden">
          <DecisionLog entries={log} />
        </aside>
      )}

      {/* subtitles */}
      {live && !votes && (
        <div key={live.key} className="rise pointer-events-none absolute inset-x-0 bottom-32 flex justify-center px-6">
          <div className="max-w-3xl rounded-2xl bg-black/70 px-6 py-3 text-center text-white backdrop-blur">
            <span className="mr-2 text-sm font-semibold uppercase tracking-wide" style={{ color: captionPersona ? "#fff" : "#ffb39c" }}>
              {captionPersona ? captionPersona.name : "You"}
            </span>
            <span className="text-lg leading-snug">{live.text}</span>
          </div>
        </div>
      )}

      {/* controls */}
      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="card flex w-[min(720px,90vw)] items-center gap-2 p-2"
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy || !!votes}
              placeholder="Type your line and press Enter"
              className="flex-1 bg-transparent px-3 py-2 outline-none"
            />
            <button type="button" onClick={() => setTyping(false)} className="px-3 text-sm text-muted">
              Use voice
            </button>
            <button disabled={busy || !!votes || !text.trim()} className="pill-dark text-sm">
              Say it <span className="arrow">→</span>
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy || !!votes || !ptt.supported}
              onPointerDown={ptt.start}
              onPointerUp={ptt.stop}
              onPointerLeave={ptt.stop}
              className={`flex items-center gap-3 rounded-full px-7 py-4 text-base font-medium shadow-lg transition disabled:opacity-50 ${
                ptt.listening ? "scale-105 bg-accent text-white" : "bg-ink text-white"
              }`}
            >
              <span className={`h-3 w-3 rounded-full ${ptt.listening ? "animate-pulse bg-white" : "bg-accent"}`} />
              {busy ? "They're thinking…" : ptt.listening ? "Listening, release to send" : ptt.supported ? "Hold Space to talk" : "Voice needs Chrome"}
            </button>
            <button type="button" onClick={() => setTyping(true)} className="card px-4 py-3 text-sm">
              Type instead
            </button>
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </main>
  );
}
