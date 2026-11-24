"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api, EXEC_COLOR } from "@/lib/ui";
import { speak, stopSpeaking, useHandsFree, usePushToTalk } from "@/lib/voice";
import type { Gesture } from "@/lib/types";

const Scene = dynamic(() => import("@/components/room/Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted">
      Setting up your team room…
    </div>
  ),
});

const TEAM = [
  { id: "cfo", name: "Maya", role: "Lead researcher" },
  { id: "tech", name: "Arjun", role: "Outreach" },
  { id: "procurement", name: "Elena", role: "Pipeline" },
] as const;

type Lead = {
  id: string;
  company: string;
  domain: string;
  why: string;
  sourceUrl: string;
  size?: string;
  funding?: string;
  status: "new" | "contacted" | "meeting";
  email?: { subject: string; body: string };
  meeting?: { when: string; start: string; subject: string; invite: string };
  foundBy: string;
  at: string;
};
type TeamState = {
  offering: string;
  company?: string;
  url?: string;
  icp?: string;
  leads: Lead[];
  chat: { who: string; text: string; at: string }[];
};
type Reply = {
  speaker: string;
  line: string;
  found?: Lead[];
  email?: Lead;
  meeting?: Lead;
  state: TeamState;
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  contacted: "bg-amber-100 text-amber-800",
  meeting: "bg-emerald-100 text-emerald-800",
};

export default function TeamRoom() {
  const [state, setState] = useState<TeamState | null>(null);
  const [me, setMe] = useState("");
  const [offering, setOffering] = useState("");
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [caption, setCaption] = useState<{ who: string; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [gestures, setGestures] = useState<Record<string, Gesture>>({});
  const [gestureUntil, setGestureUntil] = useState(0);
  const [settingUp, setSettingUp] = useState<string | null>(null);
  const [working, setWorking] = useState<{ who: string; task: string } | null>(
    null,
  );
  const [screen, setScreen] = useState<{
    who: string;
    to: string;
    subject: string;
    body: string;
    shown: number;
  } | null>(null);
  const [prefillUrl, setPrefillUrl] = useState("");
  const [mini, setMini] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const busyRef = useRef(false); // background work in flight (setup, autonomy, booking)
  const userReq = useRef(0); // newest thing you said; only its reply is spoken
  const pendingUser = useRef(0);
  const lastTalk = useRef(0);
  const [approach, setApproach] = useState<string | null>(null);
  const approachAt = useRef(0);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Your company decides which team room you are in: the URL you just entered wins, otherwise the one this browser used last.
  const companyRef = useRef("");
  const [company, setCompanyState] = useState("");
  const setCompany = useCallback((c: string) => {
    companyRef.current = c;
    setCompanyState(c);
    if (c) localStorage.setItem("dealroom-company", c);
    else localStorage.removeItem("dealroom-company");
  }, []);

  useEffect(() => {
    lastTalk.current = Date.now();
    const fromUrl =
      new URLSearchParams(window.location.search).get("url")?.trim() ?? "";
    const c = fromUrl || localStorage.getItem("dealroom-company") || "";
    companyRef.current = c;
    const name = localStorage.getItem("dealroom-me") ?? "";
    api<TeamState>(`/api/team${c ? `?url=${encodeURIComponent(c)}` : ""}`).then(
      (t) => {
        setState(t);
        setOffering(t.offering);
        // You came from the landing page with a new company: start the team on it straight away.
        if (fromUrl && name && !t.url) void setupRef.current(fromUrl, name);
        else if (t.url && name) {
          const drafted = t.leads.filter((l) => l.email).length;
          const meetings = t.leads.filter((l) => l.meeting).length;
          queue.current = [
            {
              who: "cfo",
              text: `Welcome back, ${name.split(" ")[0]}. We're selling ${t.company ?? "your product"} to ${t.icp ? t.icp.split(/[,;.]/)[0] : "your ideal customers"}. So far: ${t.leads.length} leads, ${drafted} emails ready and ${meetings} ${meetings === 1 ? "meeting" : "meetings"} booked. I'm finding more buyers now.`,
            },
          ];
        }
      },
    );
    /* eslint-disable react-hooks/set-state-in-effect -- read saved name, company and ?url once on mount */
    setCompanyState(c);
    setMe(localStorage.getItem("dealroom-me") ?? "");
    setPrefillUrl(c);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function changeCompany() {
    stopSpeaking();
    setCompany("");
    setPrefillUrl("");
    setScreen(null);
    setState({ offering: "", leads: [], chat: [] });
    setOffering("");
    window.history.replaceState(null, "", "/team");
  }

  // The teammate you call walks over to you, then answers; afterwards they go back to the table.
  const callOver = useCallback((who: string) => {
    if (backTimer.current) clearTimeout(backTimer.current);
    setApproach((cur) => {
      if (cur !== who) approachAt.current = performance.now();
      return who;
    });
  }, []);
  const speakingRef = useRef(false);
  const lastSpoke = useRef(0);
  const answer = useCallback(
    (who: string, line: string) => {
      callOver(who);
      setCaption({ who, text: line });
      speakingRef.current = true;
      const wait = Math.max(0, 2200 - (performance.now() - approachAt.current)); // let them arrive first
      setTimeout(() => {
        setSpeaker(who);
        speak(line, who, () => {
          speakingRef.current = false;
          lastSpoke.current = Date.now();
          setSpeaker((cur) => (cur === who ? null : cur));
          backTimer.current = setTimeout(
            () => setApproach((cur) => (cur === who ? null : cur)),
            4000,
          );
        });
      }, wait);
    },
    [callOver],
  );

  // Spoken updates wait their turn: only when nobody is talking, you are not speaking, and the browser allows audio.
  const queue = useRef<{ who: string; text: string }[]>([]);
  const announce = useCallback((who: string, text: string) => {
    queue.current = [
      ...queue.current.filter((q) => q.who !== who),
      { who, text },
    ].slice(-3);
  }, []);
  const listeningRef = useRef(false);
  const drafts = useRef<string[]>([]);

  const send = useCallback(
    async (said: string, auto = false) => {
      if (!said.trim()) return;
      // Background work never interrupts you and never runs while you are mid-conversation.
      if (auto && (busyRef.current || pendingUser.current > 0)) return;
      const low = said.toLowerCase();
      const named = /\bmaya\b/.test(low)
        ? "cfo"
        : /\barjun\b/.test(low)
          ? "tech"
          : /\belena\b/.test(low)
            ? "procurement"
            : null;
      const myReq = auto ? 0 : ++userReq.current;
      if (auto) busyRef.current = true;
      else {
        pendingUser.current++;
        lastTalk.current = Date.now();
        stopSpeaking();
        speakingRef.current = false;
        setSpeaker(null);
        setCaption({ who: me || "You", text: said });
        setText("");
        if (named) callOver(named);
      }
      const target = state?.leads.find((l) =>
        low.includes(l.company.toLowerCase()),
      )?.company;
      setWorking(
        /arjun|email|outreach|write/.test(low)
          ? {
              who: "tech",
              task: `writing an email${target ? ` to ${target}` : ""}`,
            }
          : /elena|pipeline|status|update|book/.test(low)
            ? { who: "procurement", task: "checking every lead and deal" }
            : {
                who: "cfo",
                task: "searching the web with Telem and enriching with Glasser",
              },
      );
      try {
        const r = await api<Reply>("/api/team", {
          url: companyRef.current,
          auto,
          text: said,
          player: me || "there",
          offering,
        });
        setState(r.state);
        if (r.found?.length) {
          setFresh(r.found.map((l) => l.id));
          setTimeout(() => setFresh([]), 6000);
        }
        if (r.email?.email) {
          setFresh((f) => [...f, r.email!.id]);
          setTimeout(() => setFresh([]), 6000);
        }
        // Background work reports back in short spoken updates (queued, never over anyone).
        if (auto) {
          const first = (me || "").split(" ")[0];
          // The teammate's own line (written by the model) is what they say; the template is only a fallback.
          if (r.found?.length) {
            const names = r.found.map((l) => l.company);
            const list =
              names.length > 1
                ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
                : names[0];
            announce(
              "cfo",
              r.line ||
                `${first ? `${first}, ` : ""}I found ${names.length} new buyers: ${list}.`,
            );
          }
          if (r.email?.email) {
            // Arjun reports in batches of three so he isn't announcing every single email.
            drafts.current.push(r.email.company);
            if (drafts.current.length >= 3) {
              const n = drafts.current.splice(0);
              announce(
                "tech",
                `${first ? `${first}, ` : ""}three more emails are ready: ${n[0]}, ${n[1]} and ${n[2]}. Each one opens with the reason they need us. Click View email on any of them.`,
              );
            }
            const drafted = r.state.leads.filter((l) => l.email).length;
            if (drafted % 5 === 0) {
              const meetings = r.state.leads.filter((l) => l.meeting).length;
              const open = r.state.leads.filter((l) => !l.email).length;
              announce(
                "procurement",
                `Pipeline update: ${r.state.leads.length} leads, ${drafted} emails ready, ${meetings} ${meetings === 1 ? "meeting" : "meetings"} booked. ${open ? `${open} leads still need an email.` : "Every lead has an email."} Book the ones you like.`,
              );
            }
          }
        }
        // Only your newest request gets a spoken answer.
        if (!auto && myReq === userReq.current) {
          setGestures({ [r.speaker]: r.found?.length ? "nod" : "leanIn" });
          setGestureUntil(performance.now() + 2500);
          answer(r.speaker, r.line);
        }
      } finally {
        if (auto) busyRef.current = false;
        else pendingUser.current--;
        setWorking(null);
      }
    },
    [me, offering, state, answer, callOver, announce],
  );

  const setupRef = useRef<(url: string, name: string) => Promise<void>>(
    async () => {},
  );
  useEffect(() => {
    setupRef.current = setup;
  });
  async function setup(url: string, name: string) {
    setSettingUp(url.replace(/^https?:\/\/(www\.)?/, ""));
    setCompany(url);
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await api<Reply>("/api/team", {
        setupUrl: url,
        player: name,
        quick: true,
      });
      setState(r.state);
      setOffering(r.state.offering);
      if (r.found?.length) {
        setFresh(r.found.map((l) => l.id));
        setTimeout(() => setFresh([]), 6000);
      }
      setCaption({ who: r.speaker, text: r.line });
      queue.current = [{ who: r.speaker, text: r.line }];
    } finally {
      busyRef.current = false;
      setBusy(false);
      setSettingUp(null);
      lastAuto.current = 0; // the team starts hunting immediately
    }
  }

  // The team never waits for you: between your requests they keep finding leads and writing emails.
  const lastAuto = useRef(0);
  const angle = useRef(0);
  useEffect(() => {
    if (!me || !state?.url) return;
    const ANGLES = [
      "companies that just raised funding",
      "companies hiring for the role that has this problem",
      "companies that just launched a new product",
      "fast-growing companies in our ideal customer segment",
      "companies expanding into new markets",
    ];
    const t = setInterval(() => {
      if (
        busyRef.current ||
        pendingUser.current > 0 ||
        Date.now() - lastAuto.current < 4000
      )
        return;
      lastAuto.current = Date.now();
      const leads = state?.leads ?? [];
      const next = leads.find((l) => !l.email);
      const turn = angle.current + (next ? 0 : 1);
      // Maya and Arjun take turns: two emails, then another search, until there are 40 leads.
      if (
        leads.length < 6 ||
        (leads.length < 40 && (!next || turn % 3 === 2))
      ) {
        const a = ANGLES[angle.current++ % ANGLES.length];
        void send(`Maya, find more buyers: ${a}.`, true);
      } else if (next) {
        angle.current++;
        void send(`Arjun, draft an email for ${next.company}.`, true);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [me, state, send]);

  useEffect(() => {
    if (!screen || screen.shown >= screen.body.length) return;
    const t = setTimeout(
      () =>
        setScreen((x) =>
          x ? { ...x, shown: Math.min(x.body.length, x.shown + 3) } : x,
        ),
      18,
    );
    return () => clearTimeout(t);
  }, [screen]);

  // Talking is always available: holding Space or the button interrupts whoever is speaking.
  const ptt = usePushToTalk(
    (said) => void send(said),
    !!me && !typing && !handsFree,
  );
  const hf = useHandsFree(
    (said) => void send(said),
    handsFree && !!me,
    speaker !== null,
  );
  useEffect(() => {
    listeningRef.current = ptt.listening;
    if (ptt.listening) {
      // You started talking: whoever was speaking stops, and you have the floor.
      speakingRef.current = false;
      lastSpoke.current = Date.now();
    }
  }, [ptt.listening]);
  useEffect(() => {
    const t = setInterval(() => {
      const next = queue.current[0];
      if (
        !next ||
        speakingRef.current ||
        pendingUser.current > 0 ||
        listeningRef.current
      )
        return;
      if (Date.now() - lastSpoke.current < 2500) return;
      // Browsers only play sound after you have clicked or pressed a key on the page.
      const active =
        (
          navigator as Navigator & {
            userActivation?: { hasBeenActive: boolean };
          }
        ).userActivation?.hasBeenActive ?? true;
      if (!active) {
        setCaption({ who: next.who, text: next.text });
        return;
      }
      queue.current = queue.current.slice(1);
      answer(next.who, next.text);
    }, 700);
    return () => clearInterval(t);
  }, [answer]);

  // Elena books the meeting: slot, invite, lead moves to "meeting".
  async function bookLead(l: Lead) {
    if (booking) return;
    setBooking(l.id);
    setWorking({
      who: "procurement",
      task: `booking a meeting with ${l.company}`,
    });
    const myReq = ++userReq.current;
    pendingUser.current++;
    stopSpeaking();
    callOver("procurement");
    try {
      const r = await api<Reply>("/api/team", {
        url: companyRef.current,
        book: l.id,
        player: me || "You",
      });
      setState(r.state);
      setOpen(l.id);
      if (myReq === userReq.current) answer(r.speaker, r.line);
    } finally {
      pendingUser.current--;
      setBooking(null);
      setWorking(null);
      lastTalk.current = Date.now();
    }
  }

  // You mark a competitor / wrong fit: it disappears and Maya learns not to bring it (or its kind) back.
  async function notBuyer(l: Lead) {
    setState((st) =>
      st ? { ...st, leads: st.leads.filter((x) => x.id !== l.id) } : st,
    );
    if (screen?.to === l.company) setScreen(null);
    const r = await api<{ state: TeamState }>("/api/team", {
      url: companyRef.current,
      remove: l.id,
    });
    setState(r.state);
  }

  function calLink(l: Lead) {
    if (!l.meeting) return "#";
    const f = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const a = new Date(l.meeting.start);
    const b = new Date(a.getTime() + 30 * 60000);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(l.meeting.subject)}&dates=${f(a)}/${f(b)}&details=${encodeURIComponent(l.meeting.invite)}`;
  }

  if (!state) return <p className="p-10 text-muted">Opening your team room…</p>;

  const counts = {
    cfo: state.leads.length,
    tech: state.leads.filter((l) => l.email).length,
    procurement: state.leads.filter((l) => l.status !== "new").length,
  };
  const capName = caption
    ? (TEAM.find((m) => m.id === caption.who)?.name ?? caption.who)
    : "";
  const live = ptt.listening
    ? { who: me || "You", text: ptt.interim || "…" }
    : caption;
  const liveName = live
    ? (TEAM.find((m) => m.id === live.who)?.name ?? live.who)
    : "";

  return (
    <main className="relative h-screen w-full overflow-hidden bg-paper">
      {(!me || !state.url) && !settingUp && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-paper/80 backdrop-blur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = (
                e.currentTarget.elements.namedItem("n") as HTMLInputElement
              ).value.trim();
              const u = (
                e.currentTarget.elements.namedItem("u") as HTMLInputElement
              ).value.trim();
              if (!n || !u) return;
              localStorage.setItem("dealroom-me", n);
              setMe(n);
              void setup(u, n);
            }}
            className="card w-[min(460px,90vw)] p-6"
          >
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Your team room
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Maya, Arjun and Elena are ready.
            </h2>
            <p className="mt-2 text-sm text-muted">
              Enter your company website. Maya researches you, works out who
              buys from you, and starts finding leads. Then just talk to the
              team.
            </p>
            <input
              name="n"
              defaultValue={me}
              placeholder="Your name"
              className="mt-4 w-full rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink"
            />
            <input
              name="u"
              defaultValue={prefillUrl}
              placeholder="Your company website, e.g. yourcompany.com"
              className="mt-2 w-full rounded-full border border-line bg-white px-5 py-3 outline-none focus:border-ink"
            />
            <button className="pill-dark mt-3">
              Walk in <span className="arrow">→</span>
            </button>
          </form>
        </div>
      )}
      {settingUp && (
        <div className="card rise absolute left-1/2 top-24 z-40 w-[min(520px,80vw)] -translate-x-1/2 px-6 py-4 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Maya is on it
          </p>
          <p className="mt-1 font-semibold">
            Researching {settingUp} with Telem, working out your ideal customer,
            then finding leads…
          </p>
        </div>
      )}

      <div className="absolute inset-0">
        <Scene
          execs={TEAM.map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role,
            color: EXEC_COLOR[m.id],
            conviction: Math.min(100, counts[m.id] * 10),
          }))}
          gestures={gestures}
          gestureUntil={gestureUntil}
          speaker={speaker}
          userTalking={ptt.listening}
          whispers={[]}
          votes={null}
          check={null}
          analystBusy={busy}
          approach={approach}
          backdropUrl="/backdrops/coast-marina.jpg"
          panorama
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div className="card pointer-events-auto flex items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="h-2 w-2 rounded-full bg-accent" /> Team room
          </Link>
          <span className="max-w-[420px] truncate text-sm text-muted">
            {state.company ? `${state.company} · ` : ""}
            {state.icp ? `selling to ${state.icp}` : offering}
          </span>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button onClick={changeCompany} className="card px-4 py-2.5 text-sm">
            Change company
          </button>
          <Link
            href={`/crm${company ? `?url=${encodeURIComponent(company)}` : ""}`}
            target="_blank"
            className="card px-4 py-2.5 text-sm"
          >
            Open CRM ↗
          </Link>
        </div>
      </div>

      {/* the team */}
      <div className="card absolute left-5 top-24 w-64 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Your team
        </p>
        <div className="mt-3 space-y-3">
          {TEAM.map((m) => (
            <button
              key={m.id}
              onClick={() =>
                void send(
                  `${m.name}, ${m.id === "cfo" ? "find me new leads" : m.id === "tech" ? "draft an email for our best new lead" : "give me a pipeline update"}.`,
                )
              }
              className={`flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-black/[0.04] ${speaker === m.id ? "bg-black/[0.05]" : ""}`}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ background: EXEC_COLOR[m.id] }}
              >
                {m.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <span className="block text-sm font-semibold">{m.name}</span>
                <span className="block text-xs text-muted">
                  {m.role} ·{" "}
                  {m.id === "cfo"
                    ? `${counts.cfo} leads`
                    : m.id === "tech"
                      ? `${counts.tech} emails`
                      : `${counts.procurement} in play`}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted">
          Say a name to call them: &ldquo;Maya, find fintech startups in New
          York&rdquo;.
        </p>
      </div>

      {/* what the team is doing right now */}
      {working && (
        <div className="card rise absolute left-1/2 top-24 z-20 flex -translate-x-1/2 items-center gap-3 px-5 py-3">
          <span
            className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
            style={{
              background: EXEC_COLOR[working.who as keyof typeof EXEC_COLOR],
            }}
          >
            {TEAM.find((m) => m.id === working.who)
              ?.name.slice(0, 2)
              .toUpperCase()}
          </span>
          <span className="text-sm">
            <span className="font-semibold">
              {TEAM.find((m) => m.id === working.who)?.name}
            </span>{" "}
            is {working.task}
          </span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/60"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
        </div>
      )}
      {screen && (
        <div className="card rise absolute left-[300px] top-[150px] z-20 w-[400px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-black/[0.03] px-4 py-2 text-xs text-muted">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />{" "}
              Arjun&rsquo;s email
            </span>
            <button onClick={() => setScreen(null)} className="hover:text-ink">
              Close
            </button>
          </div>
          <div className="px-4 py-3 text-sm">
            <p className="text-xs text-muted">To: {screen.to}</p>
            <p className="mt-1 font-semibold">{screen.subject}</p>
            <p className="mt-2 min-h-[120px] whitespace-pre-line text-ink/85">
              {screen.body.slice(0, screen.shown)}
              {screen.shown < screen.body.length && (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-middle" />
              )}
            </p>
            {screen.shown >= screen.body.length && (
              <a
                href={`mailto:?subject=${encodeURIComponent(screen.subject)}&body=${encodeURIComponent(screen.body)}`}
                className="mt-3 inline-block text-xs underline"
              >
                Send from my email
              </a>
            )}
          </div>
        </div>
      )}

      {/* leads dashboard */}
      <aside
        className={`card absolute right-5 top-24 flex flex-col overflow-hidden ${mini ? "w-[220px]" : "bottom-28 w-[360px]"}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Leads · {state.leads.length}
          </p>
          <span className="flex items-center gap-2 text-xs text-muted">
            {!mini &&
              `${counts.tech} drafted · ${state.leads.filter((l) => l.status === "meeting").length} meetings`}
            <button
              onClick={() => setMini((m) => !m)}
              className="rounded-full border border-line px-2 py-0.5 hover:border-ink"
              aria-label={mini ? "Expand leads" : "Minimize leads"}
            >
              {mini ? "Show" : "—"}
            </button>
          </span>
        </div>
        <div
          className={`flex-1 space-y-2 overflow-y-auto p-3 ${mini ? "hidden" : ""}`}
        >
          {state.leads.length === 0 && (
            <p className="p-2 text-sm text-muted">
              No leads yet. Say &ldquo;Maya, find me leads&rdquo;.
            </p>
          )}
          {state.leads.map((l) => (
            <div
              key={l.id}
              className={`rise rounded-xl border bg-white p-3 text-sm ${fresh.includes(l.id) ? "border-accent" : "border-line"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.company}</p>
                  <p className="truncate text-xs text-muted">
                    {l.domain}
                    {l.size ? ` · ${l.size} people` : ""}
                    {l.funding ? ` · ${l.funding}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[l.status]}`}
                  >
                    {l.status}
                  </span>
                  <button
                    onClick={() => void notBuyer(l)}
                    title="Not a buyer (competitor or wrong fit). Maya won't suggest it again."
                    aria-label={`Remove ${l.company}: not a buyer`}
                    className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-black/[0.06] hover:text-ink"
                  >
                    ×
                  </button>
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-ink/80">{l.why}</p>
              <p className="mt-1 text-[11px] text-muted">
                Found by {l.foundBy} via Telem{" "}
                {l.sourceUrl && (
                  <a href={l.sourceUrl} target="_blank" className="underline">
                    source
                  </a>
                )}
                {l.size || l.funding ? " · enriched by Glasser" : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() =>
                    l.email
                      ? setScreen(
                          screen?.to === l.company
                            ? null
                            : {
                                who: "tech",
                                to: l.company,
                                subject: l.email.subject,
                                body: l.email.body,
                                shown: 0,
                              },
                        )
                      : void send(`Arjun, draft an email for ${l.company}.`)
                  }
                  className={`rounded-full border px-3 py-1 text-xs hover:border-ink ${l.email && screen?.to === l.company ? "border-ink bg-black/[0.05]" : "border-line"}`}
                >
                  {l.email
                    ? screen?.to === l.company
                      ? "Hide email"
                      : "View email"
                    : "Draft email"}
                </button>
                {l.meeting ? (
                  <a
                    href={calLink(l)}
                    target="_blank"
                    className="rounded-full bg-emerald-600 px-3 py-1 text-xs text-white"
                  >
                    Booked · {l.meeting.when}
                  </a>
                ) : (
                  <button
                    onClick={() => void bookLead(l)}
                    disabled={!!booking}
                    className="rounded-full bg-ink px-3 py-1 text-xs text-white disabled:opacity-60"
                  >
                    {booking === l.id ? "Elena is booking…" : "Book meeting →"}
                  </button>
                )}
              </div>
              {open === l.id && l.meeting && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-xs">
                  <p className="font-semibold">
                    {l.meeting.subject} · {l.meeting.when}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-ink/85">
                    {l.meeting.invite}
                  </p>
                  <a
                    href={calLink(l)}
                    target="_blank"
                    className="mt-2 inline-block underline"
                  >
                    Add to Google Calendar
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {live && (
        <div className="rise pointer-events-none absolute bottom-32 left-72 right-[390px] flex justify-center px-6">
          <div className="max-w-2xl rounded-2xl bg-black/70 px-6 py-3 text-center text-white backdrop-blur">
            <span className="mr-2 text-sm font-semibold uppercase tracking-wide">
              {liveName}
            </span>
            <span className="text-lg leading-snug">{live.text}</span>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="card flex w-[min(640px,90vw)] items-center gap-2 p-2"
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Talk to your team, e.g. Maya, find me leads in healthcare"
              className="flex-1 bg-transparent px-3 py-2 outline-none"
            />
            <button
              type="button"
              onClick={() => setTyping(false)}
              className="px-3 text-sm text-muted"
            >
              Use voice
            </button>
            <button disabled={!text.trim()} className="pill-dark text-sm">
              Say it <span className="arrow">→</span>
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!ptt.supported}
              onPointerDown={ptt.start}
              onPointerUp={ptt.stop}
              onPointerLeave={ptt.stop}
              className={`flex items-center gap-3 rounded-full px-7 py-4 font-medium text-white shadow-lg transition disabled:opacity-50 ${ptt.listening ? "scale-105 bg-accent" : "bg-ink"}`}
            >
              <span
                className={`h-3 w-3 rounded-full ${ptt.listening ? "animate-pulse bg-white" : "bg-accent"}`}
              />
              {ptt.listening
                ? "Listening, release to send"
                : "Hold Space to talk"}
            </button>
            <button
              type="button"
              onClick={() => setHandsFree((h) => !h)}
              className={`card px-4 py-3 text-sm ${handsFree ? "ring-2 ring-accent" : ""}`}
            >
              {handsFree
                ? `● Hands-free${hf.heard ? `: ${hf.heard.slice(0, 30)}` : ""}`
                : "Hands-free"}
            </button>
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="card px-4 py-3 text-sm"
            >
              Type instead
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
