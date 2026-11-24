import { type EventRow } from "../db";
import { analystCheck, extractClaims } from "./claims";
import { executiveTurn, pickSpeaker } from "./executive";
import { assessPerformance } from "./director";
import { inbox, sendMessage } from "../sponsors/band";
import {
  EXEC_IDS,
  MAX_TURNS,
  type ExecId,
  type ExecTurn,
  type SessionState,
  type SharedLogEntry,
  type TurnResponse,
} from "../types";

const EVENT_TEXT: Record<string, string> = {
  budget_freeze: "Budget freeze: finance has paused all new tooling spend this quarter.",
  competitor_bid: "A competitor just sent a cheaper bid to the committee.",
  exec_sponsor_joins: "An executive sponsor has joined the room and wants a decision today.",
};

/**
 * One round of the meeting. Either a human player speaks, or (auto) the humans have gone quiet
 * and the agents act on their own. Mutates the session and returns events + response.
 */
export async function runRound(
  s: SessionState,
  input: { player?: string; utterance?: string; auto?: boolean; called?: ExecId | null },
): Promise<{ events: EventRow[]; res: TurnResponse }> {
  const id = s.id;
  const turn = s.turn + 1;
  const room = s.bandRoomId!;
  const player = input.player || s.players?.[0]?.name || "Seller";
  const utterance = input.auto
    ? `(The selling team has gone quiet for a while. Nobody on their side is speaking. Act on your own goals: press, propose a trade, coordinate with a colleague, or move the meeting.)`
    : (input.utterance || "").trim();
  const events: EventRow[] = [];
  const log: Omit<SharedLogEntry, "key">[] = [];
  if (!input.auto) {
    events.push({ session_id: id, turn, actor: "user", event_type: "utterance", text: `${player}: ${utterance}` });
    log.push({ turn, actor: "user", action: `${player} pitches`, detail: utterance });
  } else {
    log.push({ turn, actor: "director", action: "humans are silent: agents act on their own" });
  }

  // Claims -> analyst over BAND -> fact checks (only for human lines).
  const claims = input.auto ? [] : await extractClaims(utterance, s.brief);
  const factChecks = await Promise.all(
    claims.map(async (claim) => {
      await sendMessage(room, { from: "director", to: "analyst", text: claim, kind: "claim_check" });
      const result = await analystCheck(claim, s.brief);
      await sendMessage(room, { from: "analyst", to: "all", text: `${result.status}: ${claim}`, kind: "claim_result" });
      return result;
    }),
  );
  for (const c of factChecks) {
    s.claimChecks.push({ ...c, turn });
    events.push({ session_id: id, turn, actor: "analyst", event_type: "claim_check", text: c.claim, status: c.status, source_url: c.sourceUrl, target: c.note });
    log.push({
      turn, actor: "analyst", action: `fact check: ${c.status}`, tone: c.status === "verified" ? "good" : "bad",
      detail: c.claim, reason: `${c.note}${c.sourceUrl ? ` (${c.sourceUrl})` : ""}`,
    });
  }

  const labelled = input.auto ? utterance : `${player} (seller team) says: ${utterance}${input.called ? ` [${player} is speaking directly to ${s.personas.find((p) => p.id === input.called)?.name}, who should answer them personally]` : ""}`;
  const inboxes = await Promise.all(EXEC_IDS.map((e) => inbox(room, e)));
  const results = await Promise.all(
    s.personas.map((p, i) =>
      executiveTurn({ persona: p, session: s, utterance: labelled, inbox: inboxes[i].filter((m) => m.kind === "whisper").slice(-3), factChecks }),
    ),
  );
  const turns = Object.fromEntries(s.personas.map((p, i) => [p.id, results[i]])) as Record<ExecId, ExecTurn>;

  // Called by name: that executive answers, and walks over to the seller.
  const speaker = input.called && turns[input.called] ? input.called : pickSpeaker(turns);
  if (!input.auto) s.transcript.push({ turn, speaker: player, text: utterance });
  s.transcript.push({ turn, speaker, text: turns[speaker].spokenLine });

  const whisperPairs: TurnResponse["whisperPairs"] = [];
  const thoughts = {} as TurnResponse["thoughts"];
  const players = new Set((s.players ?? []).map((x) => x.name.toLowerCase()));
  s.alliances ??= {};
  s.worldEvents ??= [];
  let worldEvent: { kind: string; text: string; by: string } | null = null;

  for (const p of s.personas) {
    const t = turns[p.id];
    const before = p.conviction;
    p.conviction = Math.max(0, Math.min(100, before + t.convictionDelta));
    thoughts[p.id] = { privateThought: t.privateThought, reason: t.reason, delta: t.convictionDelta, urge: t.urgeToSpeak };
    events.push({ session_id: id, turn, actor: p.id, event_type: "thought", text: t.privateThought });
    events.push({ session_id: id, turn, actor: p.id, event_type: "conviction_change", text: t.reason, target: t.objectionType, conviction_before: before, conviction_after: p.conviction });
    log.push({
      turn, actor: p.id, action: `${t.convictionDelta >= 0 ? "+" : ""}${t.convictionDelta} → ${p.conviction} · ${t.gesture}`,
      tone: t.convictionDelta > 0 ? "good" : t.convictionDelta < 0 ? "bad" : "neutral", detail: `thinks: ${t.privateThought}`, reason: t.reason,
    });

    // Each agent tracks which human's lines actually moved it (its own memory of who serves its goals).
    if (!input.auto && input.player) {
      s.playerScores ??= {};
      const sc = (s.playerScores[p.id] ??= {});
      sc[player] = (sc[player] ?? 0) + t.convictionDelta;
    }
    // Alliances: the agent's own choice; if it stays silent, its goal rule decides from turn 3 on.
    let want = (t.allyWith || "").trim();
    if ((!want || want.toLowerCase() === "none") && turn >= 3 && (s.players?.length ?? 0) >= 2) {
      const sc = s.playerScores?.[p.id] ?? {};
      const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] > 0) want = best[0];
    }
    const matched = (s.players ?? []).find((x) => want.toLowerCase().includes(x.name.toLowerCase()));
    const wantValid = want && want.toLowerCase() !== "none" ? (matched?.name ?? (players.size === 0 ? want : null)) : null;
    const prev = s.alliances[p.id] ?? null;
    if (wantValid && wantValid !== prev) {
      s.alliances[p.id] = wantValid;
      const betray = Boolean(prev);
      events.push({ session_id: id, turn, actor: p.id, event_type: "alliance", text: betray ? `betrays ${prev}, backs ${wantValid}` : `backs ${wantValid}`, target: wantValid, status: betray ? "betray" : "ally" });
      log.push({ turn, actor: p.id, action: betray ? `betrays ${prev} and backs ${wantValid}` : `allies with ${wantValid}`, tone: betray ? "bad" : "good", reason: t.reason });
    } else if (!wantValid && prev && want.toLowerCase() === "none") {
      s.alliances[p.id] = null;
      events.push({ session_id: id, turn, actor: p.id, event_type: "alliance", text: `drops support for ${prev}`, target: prev, status: "betray" });
      log.push({ turn, actor: p.id, action: `drops ${prev}`, tone: "bad", reason: t.reason });
    }
    if (t.offer && t.offer.trim()) {
      events.push({ session_id: id, turn, actor: p.id, event_type: "trade", text: t.offer.trim() });
      log.push({ turn, actor: p.id, action: "offers a trade", tone: "neutral", detail: t.offer.trim() });
    }
    // World event, caused by an agent alone (one per meeting).
    if (!worldEvent && s.worldEvents.length === 0 && t.worldEvent && t.worldEvent !== "none" && EVENT_TEXT[t.worldEvent]) {
      worldEvent = { kind: t.worldEvent, text: EVENT_TEXT[t.worldEvent], by: p.id };
      s.worldEvents.push({ turn, by: p.id, kind: t.worldEvent, text: EVENT_TEXT[t.worldEvent] });
      events.push({ session_id: id, turn, actor: p.id, event_type: "world_event", text: EVENT_TEXT[t.worldEvent], status: t.worldEvent });
      log.push({ turn, actor: p.id, action: `WORLD EVENT: ${t.worldEvent.replace(/_/g, " ")}`, tone: "bad", detail: EVENT_TEXT[t.worldEvent], reason: t.reason });
    }

    if (t.privateMessage) {
      await sendMessage(room, { from: p.id, to: t.privateMessage.to, text: t.privateMessage.text, kind: "whisper" });
      s.whispers.push({ turn, from: p.id, to: t.privateMessage.to, text: t.privateMessage.text });
      whisperPairs.push({ from: p.id, to: t.privateMessage.to });
      events.push({ session_id: id, turn, actor: p.id, event_type: "whisper", text: t.privateMessage.text, target: t.privateMessage.to });
      log.push({ turn, actor: p.id, action: `whispers to ${t.privateMessage.to}`, detail: "hidden", hidden: true });
    }
  }
  // Agents' own goal rules can also trigger the meeting's one world event, with no human involved.
  if (!worldEvent && s.worldEvents.length === 0 && turn >= 3) {
    const cfo = s.personas.find((p) => p.id === "cfo");
    const proc = s.personas.find((p) => p.id === "procurement");
    const priceTalk = Object.values(turns).filter((t) => t.objectionType === "price").length >= 1;
    let rule: { kind: string; by: ExecId; why: string } | null = null;
    if (cfo && cfo.conviction <= 30) rule = { kind: "budget_freeze", by: "cfo", why: `CFO conviction fell to ${cfo.conviction}, so finance protects the budget` };
    else if (proc && priceTalk && proc.conviction < 45) rule = { kind: "competitor_bid", by: "procurement", why: `price is unresolved and procurement sits at ${proc.conviction}, so they bring a rival bid for leverage` };
    else if (s.personas.every((p) => p.conviction >= 60)) rule = { kind: "exec_sponsor_joins", by: "tech", why: "the whole committee is above 60, so they pull in their boss to decide" };
    if (rule) {
      worldEvent = { kind: rule.kind, text: EVENT_TEXT[rule.kind], by: rule.by };
      s.worldEvents.push({ turn, by: rule.by, kind: rule.kind, text: EVENT_TEXT[rule.kind] });
      events.push({ session_id: id, turn, actor: rule.by, event_type: "world_event", text: EVENT_TEXT[rule.kind], status: rule.kind });
      log.push({ turn, actor: rule.by, action: `WORLD EVENT: ${rule.kind.replace(/_/g, " ")}`, tone: "bad", detail: EVENT_TEXT[rule.kind], reason: rule.why });
      await Promise.all(s.personas.filter((p) => p.id !== rule!.by).map((p) => sendMessage(room, { from: rule!.by, to: p.id, text: `Heads up: ${EVENT_TEXT[rule!.kind]}`, kind: "whisper" })));
    }
  }

  events.push({ session_id: id, turn, actor: speaker, event_type: "utterance", text: turns[speaker].spokenLine, target: turns[speaker].objectionType });
  events.push({ session_id: id, turn, actor: "director", event_type: "speaker_pick", text: `${speaker} speaks (urge ${turns[speaker].urgeToSpeak})`, target: speaker });
  log.push({ turn, actor: "director", action: `floor to ${speaker} (urge ${turns[speaker].urgeToSpeak}/10)` });

  const assess = assessPerformance(s, s.personas.map((p) => turns[p.id].convictionDelta), factChecks);
  const changed = assess.tactic !== (s.tactic ?? "probe");
  s.tactic = assess.tactic;
  (s.tacticHistory ??= []).push({ turn, tactic: assess.tactic, performance: assess.performance, reason: assess.reason });
  events.push({ session_id: id, turn, actor: "director", event_type: "adapt", text: assess.reason, status: assess.tactic, target: assess.performance });
  if (changed) {
    await Promise.all(
      s.personas.map((p) => sendMessage(room, { from: "director", to: p.id, text: `Switch to ${assess.tactic}: sellers are ${assess.performance} (${assess.reason}).`, kind: "whisper" })),
    );
    log.push({
      turn, actor: "director", action: `committee adapts: ${assess.tactic.toUpperCase()}`,
      tone: assess.tactic === "close" ? "good" : assess.tactic === "pressure" ? "bad" : "neutral",
      detail: `Sellers are ${assess.performance}. Briefed all three executives over BAND.`, reason: assess.reason,
    });
  }

  // Shared state every connected player renders.
  const gestures = Object.fromEntries(s.personas.map((p) => [p.id, turns[p.id].gesture])) as TurnResponse["gestures"];
  const seq = (s.seq ?? 0) + 1;
  s.seq = seq;
  s.log ??= [];
  log.forEach((e, i) => s.log!.push({ ...e, key: `${seq}-${i}` }));
  s.live = { speaker, line: turns[speaker].spokenLine, gestures, gestureAt: Date.now(), check: factChecks[factChecks.length - 1] ?? null, whispers: whisperPairs, event: worldEvent, approach: input.called ?? null, crm: null };
  s.turn = turn;

  const res: TurnResponse = {
    turn,
    speaker,
    spokenLine: turns[speaker].spokenLine,
    gestures,
    convictions: Object.fromEntries(s.personas.map((p) => [p.id, p.conviction])) as TurnResponse["convictions"],
    thoughts,
    factChecks,
    whisperPairs,
    adaptation: { tactic: assess.tactic, performance: assess.performance, reason: assess.reason, changed },
    done: turn >= MAX_TURNS,
  };
  return { events, res };
}
