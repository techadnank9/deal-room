"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DecisionLog, { type LogEntry } from "@/components/room/DecisionLog";
import ModelPicker from "@/components/ModelPicker";
import { api, EXEC_COLOR, EXEC_LABEL, initials } from "@/lib/ui";
import { speak, stopSpeaking, useHandsFree, usePushToTalk } from "@/lib/voice";
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
  const [model, setModel] = useState("");
  const [tactic, setTactic] = useState<{ tactic: string; performance: string; reason: string } | null>(null);
  const [tacticKey, setTacticKey] = useState(0);
  const [me, setMe] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [worldEvent, setWorldEvent] = useState<{ kind: string; text: string; by: string } | null>(null);
  const [approach, setApproach] = useState<string | null>(null);
  const [crm, setCrm] = useState<NonNullable<NonNullable<SessionState["live"]>["crm"]> | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const seqRef = useRef(-1);
  const busyRef = useRef(false);
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

  const applySession = useCallback(
    (session: SessionState, opts: { speakIt?: boolean } = {}) => {
      setS(session);
      setTurn(session.turn);
      setConvictions(Object.fromEntries(session.personas.map((p) => [p.id, p.conviction])));
      const seq = session.seq ?? 0;
      if (seq === seqRef.current) return;
      const first = seqRef.current === -1;
      seqRef.current = seq;
      const entries = session.personas.map((p, i) => ({
        key: `enter-${i}`,
        turn: 0,
        actor: p.id,
        action: "walks in",
        detail: `${p.name}, ${p.title}`,
      }));
      setLog([...entries, ...(session.log ?? [])]);
      const th = session.tacticHistory?.[session.tacticHistory.length - 1];
      if (th) setTactic({ tactic: th.tactic, performance: th.performance, reason: th.reason });
      const lv = session.live;
      if (lv && !first) {
        setGestures(lv.gestures as Record<string, Gesture>);
        setGestureUntil(performance.now() + 2800);
        setUserTalking(false);
        setSpeaker(lv.speaker as ExecId);
        setCaption({ who: lv.speaker, text: lv.line, key: seq });
        if (lv.whispers.length) {
          setWhispers(lv.whispers);
          setTimeout(() => setWhispers([]), 3800);
        }
        if (lv.check) {
          setLastCheck(lv.check);
          setCheckKey((k) => k + 1);
        }
        setApproach(lv.approach ?? null);
        if (lv.crm) setCrm(lv.crm);
        if (lv.event) {
          setWorldEvent(lv.event);
          setTimeout(() => setWorldEvent(null), 9000);
        }
        if (opts.speakIt !== false && !mutedRef.current) {
          const who = lv.speaker;
          speak(lv.line, who, () => setSpeaker((cur) => (cur === who ? null : cur)));
        }
      } else if (lv?.check) setLastCheck(lv.check);
      if (session.status === "finished" && session.votes) {
        setVotes(session.votes);
        setTimeout(() => router.push(`/score/${id}`), 7500);
      }
    },
    [id, router],
  );

  const refresh = useCallback(async () => {
    const { session } = await api<{ session: SessionState }>(`/api/session?id=${id}`);
    applySession(session);
    return session;
  }, [id, applySession]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setMe(localStorage.getItem(`dealroom-player-${id}`) ?? "");
    api<{ session: SessionState }>(`/api/session?id=${id}`)
      .then(({ session }) => {
        if (session.status === "finished") return router.replace(`/score/${id}`);
        setModel(session.model ?? "");
        applySession(session, { speakIt: false });
      })
      .catch((e) => setErr(String(e)));
  }, [id, router, applySession]);

  // Shared room: every player polls the same session; agents act on their own when everyone is quiet.
  useEffect(() => {
    if (!me) return;
    const poll = setInterval(() => {
      if (!busyRef.current) refresh().catch(() => {});
    }, 2000);
    const tick = setInterval(() => {
      if (!busyRef.current) api("/api/tick", { id }).catch(() => {});
    }, 7000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [me, id, refresh]);

  async function join(name: string) {
    const n = name.trim();
    if (!n) return;
    await api("/api/join", { id, name: n });
    localStorage.setItem(`dealroom-player-${id}`, n);
    setMe(n);
    refresh().catch(() => {});
  }

  const verdict = useCallback(async () => {
    setBusy(true);
    stopSpeaking();
    try {
      const r = await api<{ votes: Vote[] }>("/api/verdict", { id });
      setVotes(r.votes);
      seqRef.current = -2;
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
    setCaption({ who: me || "You", text: utterance, key: Date.now() });
    try {
      busyRef.current = true;
      const r = await api<TurnResponse>("/api/turn", { id, text: utterance, player: me });
      if (r.thoughts) setDeltas(Object.fromEntries(Object.entries(r.thoughts).map(([k, t]) => [k, t.delta])));
      busyRef.current = false;
      await refresh();
      setText("");
      setBusy(false);
      if (r.done) await verdict();
    } catch (e) {
      busyRef.current = false;
      setErr(String(e));
      setUserTalking(false);
      setBusy(false);
    }
  }

  const ptt = usePushToTalk((said) => void send(said), !!s && !busy && !votes && !typing && !handsFree);
  const hf = useHandsFree((said) => void send(said), handsFree && !!s && !votes, busy || speaker !== null);

  if (err && !s) return <p className="p-10 text-red-600">{err}</p>;
  if (!s) return <p className="p-10 text-muted">Opening the room…</p>;

  const live = ptt.listening ? { who: "You", text: ptt.interim || "…", key: -1 } : caption;
  const captionPersona = live && s.personas.find((p) => p.id === live.who);
  const buys = votes?.filter((v) => v.vote === "buy").length ?? 0;

  return (
    <main className="relative h-screen w-full overflow-hidden bg-paper">
      {!me && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-paper/80 backdrop-blur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void join(nameDraft);
            }}
            className="card w-[min(440px,90vw)] p-6"
          >
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Join the selling team</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{s.brief.company} is waiting.</h2>
            <p className="mt-2 text-sm text-muted">
              Humans and AI executives share this room. Each executive has their own goals: they may back you, trade with you, or turn on you.
              {s.players?.length ? ` Already here: ${s.players.map((p) => p.name).join(", ")}.` : ""}
            </p>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your name"
              className="mt-4 w-full rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink"
            />
            <button className="pill-dark mt-3">
              Enter the room <span className="arrow">→</span>
            </button>
          </form>
        </div>
      )}
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
          approach={approach}
          backdropUrl={s.backdropUrl ? `/api/image?url=${encodeURIComponent(s.backdropUrl)}` : null}
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
          <span className="flex -space-x-1.5">
            {(s.players ?? []).map((p) => (
              <span
                key={p.name}
                title={p.name}
                className="grid h-7 w-7 place-items-center rounded-full border-2 border-white text-[11px] font-semibold text-white"
                style={{ background: p.color }}
              >
                {initials(p.name)}
              </span>
            ))}
          </span>
          <button
            onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink"
            title="Copy the room link for a teammate"
          >
            Invite teammate
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <ModelPicker
            compact
            value={model}
            onChange={async (m) => {
              setModel(m);
              await fetch("/api/session", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, model: m }) });
              push([{ turn: turnRef.current, actor: "director", action: `model switched to ${m}` }]);
            }}
          />
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
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">The room</p>
          {tactic && (
            <span
              key={tacticKey}
              title={tactic.reason}
              className={`rise rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                tactic.tactic === "pressure" ? "bg-red-100 text-red-700" : tactic.tactic === "close" ? "bg-emerald-100 text-emerald-700" : "bg-black/[0.06] text-ink"
              }`}
            >
              {tactic.tactic === "pressure" ? "Pressing you" : tactic.tactic === "close" ? "Ready to close" : "Probing"}
            </span>
          )}
        </div>
        {tactic && <p className="mt-1 text-[11px] leading-snug text-muted">You are {tactic.performance}: {tactic.reason}</p>}
        <div className="mt-3 space-y-3">
          {s.personas.map((p) => {
            const c = convictions[p.id] ?? p.conviction;
            const d = deltas[p.id];
            const vote = votes?.find((v) => v.id === p.id);
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl p-1.5 transition ${speaker === p.id ? "bg-black/[0.04]" : ""}`}>
                {s.portraits?.[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/image?url=${encodeURIComponent(s.portraits[p.id]!)}`} alt={p.name} className="h-10 w-10 shrink-0 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${EXEC_COLOR[p.id]}` }} />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: EXEC_COLOR[p.id] }}>
                    {initials(p.name)}
                  </div>
                )}
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
                  <div className="text-xs text-muted">
                    {EXEC_LABEL[p.id]}
                    {s.alliances?.[p.id] ? <span className="ml-1 font-medium text-emerald-700">· backs {s.alliances[p.id]}</span> : null}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c}%`, background: EXEC_COLOR[p.id] }} />
                  </div>
                </div>
              </div>
            );
          })}
          <div className={`flex items-center gap-3 rounded-xl p-1.5 transition ${speaker === ("analyst" as ExecId) ? "bg-black/[0.04]" : ""}`}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: "#db2777" }}>
              AN
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold">Analyst</span>
              <div className="text-xs text-muted">Fact checks, CRM, follow-ups. Say &ldquo;analyst, update me on the leads&rdquo;</div>
            </div>
          </div>
        </div>
      </div>

      {/* CRM pulled up by the analyst */}
      {crm && !votes && (
        <div className="card rise absolute bottom-28 left-5 z-20 max-h-[60vh] w-[440px] overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Analyst · CRM</p>
            <button onClick={() => setCrm(null)} className="text-xs text-muted hover:text-ink">
              Close
            </button>
          </div>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-1 font-medium">Account</th>
                <th className="pb-1 font-medium">Stage</th>
                <th className="pb-1 font-medium">Risk</th>
                <th className="pb-1 font-medium">Next</th>
              </tr>
            </thead>
            <tbody>
              {crm.leads.map((l) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2 font-semibold">{l.company}</td>
                  <td className="py-1.5 pr-2">{l.stage}</td>
                  <td className={`py-1.5 pr-2 font-semibold ${l.risk === "High" ? "text-red-600" : l.risk === "Medium" ? "text-amber-700" : "text-emerald-700"}`}>{l.risk}</td>
                  <td className="py-1.5 text-muted">{l.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 rounded-xl border border-line bg-white p-3 text-sm">
            <p className="text-xs text-muted">Draft follow-up · to {crm.email.to}</p>
            <p className="mt-1 font-semibold">{crm.email.subject}</p>
            <p className="mt-1 whitespace-pre-line text-ink/85">{crm.email.body}</p>
            <a
              href={`mailto:?subject=${encodeURIComponent(crm.email.subject)}&body=${encodeURIComponent(crm.email.body)}`}
              className="pill-dark mt-3 text-xs"
            >
              Open in email <span className="arrow">→</span>
            </a>
          </div>
        </div>
      )}

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

      {/* world event caused by an agent */}
      {worldEvent && !votes && (
        <div className="card rise absolute left-1/2 top-48 z-20 w-[min(560px,70vw)] -translate-x-1/2 border-2 border-accent px-6 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">World event · caused by {s.personas.find((p) => p.id === worldEvent.by)?.name ?? worldEvent.by}</p>
          <p className="mt-1 text-lg font-semibold">{worldEvent.text}</p>
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
            <span className="mr-2 text-sm font-semibold uppercase tracking-wide" style={{ color: captionPersona || live.who === "analyst" ? "#fff" : "#ffb39c" }}>
              {captionPersona ? captionPersona.name : live.who === "analyst" ? "Analyst" : live.who}
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
            <button
              type="button"
              onClick={() => setHandsFree((h) => !h)}
              className={`card px-4 py-3 text-sm ${handsFree ? "ring-2 ring-accent" : ""}`}
              title="Keep the mic open: just talk, call anyone by name"
            >
              {handsFree ? `● Hands-free${hf.heard ? `: ${hf.heard.slice(0, 40)}` : ""}` : "Hands-free"}
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
