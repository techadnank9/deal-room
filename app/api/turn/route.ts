import { withModel } from "@/lib/llm";
import { loadSession, saveSession, writeEvents, type EventRow } from "@/lib/db";
import { analystCheck, extractClaims } from "@/lib/agents/claims";
import { executiveTurn, pickSpeaker } from "@/lib/agents/executive";
import { assessPerformance } from "@/lib/agents/director";
import { inbox, sendMessage } from "@/lib/sponsors/band";
import { EXEC_IDS, MAX_TURNS, type ExecId, type ExecTurn, type TurnResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { id: string; text: string };
  const current = await loadSession(body.id);
  return withModel(current?.model, () => handle(body));
}

async function handle(body: { id: string; text: string }) {
  const { id, text } = body;
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  if (s.status !== "active") return Response.json({ error: "session finished" }, { status: 409 });
  const utterance = (text || "").trim();
  if (!utterance) return Response.json({ error: "empty utterance" }, { status: 400 });

  const turn = s.turn + 1;
  const room = s.bandRoomId!;
  const events: EventRow[] = [{ session_id: id, turn, actor: "user", event_type: "utterance", text: utterance }];

  // 1-3. Claims -> analyst over BAND -> fact checks.
  const claims = await extractClaims(utterance, s.brief);
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
  }

  // 4. Three executives in parallel; each sees whispers addressed to it.
  const inboxes = await Promise.all(EXEC_IDS.map((e) => inbox(room, e)));
  const results = await Promise.all(
    s.personas.map((p, i) =>
      executiveTurn({
        persona: p,
        session: s,
        utterance,
        inbox: inboxes[i].filter((m) => m.kind === "whisper").slice(-3),
        factChecks,
      }),
    ),
  );
  const turns = Object.fromEntries(s.personas.map((p, i) => [p.id, results[i]])) as Record<ExecId, ExecTurn>;

  // 5. Director picks the speaker.
  const speaker = pickSpeaker(turns);
  s.transcript.push({ turn, speaker: "user", text: utterance });
  s.transcript.push({ turn, speaker, text: turns[speaker].spokenLine });

  const whisperPairs: TurnResponse["whisperPairs"] = [];
  const thoughts = {} as TurnResponse["thoughts"];
  for (const p of s.personas) {
    const t = turns[p.id];
    const before = p.conviction;
    p.conviction = Math.max(0, Math.min(100, before + t.convictionDelta));
    thoughts[p.id] = { privateThought: t.privateThought, reason: t.reason, delta: t.convictionDelta, urge: t.urgeToSpeak };
    events.push({ session_id: id, turn, actor: p.id, event_type: "thought", text: t.privateThought });
    events.push({
      session_id: id, turn, actor: p.id, event_type: "conviction_change",
      text: t.reason, target: t.objectionType,
      conviction_before: before, conviction_after: p.conviction,
    });
    if (t.privateMessage) {
      await sendMessage(room, { from: p.id, to: t.privateMessage.to, text: t.privateMessage.text, kind: "whisper" });
      s.whispers.push({ turn, from: p.id, to: t.privateMessage.to, text: t.privateMessage.text });
      whisperPairs.push({ from: p.id, to: t.privateMessage.to });
      events.push({ session_id: id, turn, actor: p.id, event_type: "whisper", text: t.privateMessage.text, target: t.privateMessage.to });
    }
  }
  events.push({
    session_id: id, turn, actor: speaker, event_type: "utterance", text: turns[speaker].spokenLine,
    target: turns[speaker].objectionType,
  });
  events.push({
    session_id: id, turn, actor: "director", event_type: "speaker_pick",
    text: `${speaker} speaks (urge ${turns[speaker].urgeToSpeak})`, target: speaker,
  });

  // Director: read how the human is doing and adapt the committee's tactic for the next turn.
  const assess = assessPerformance(
    s,
    s.personas.map((p) => turns[p.id].convictionDelta),
    factChecks,
  );
  const changed = assess.tactic !== (s.tactic ?? "probe");
  s.tactic = assess.tactic;
  (s.tacticHistory ??= []).push({ turn, tactic: assess.tactic, performance: assess.performance, reason: assess.reason });
  events.push({
    session_id: id, turn, actor: "director", event_type: "adapt",
    text: assess.reason, status: assess.tactic, target: assess.performance,
  });
  if (changed) {
    // Coordinate the committee about the human: the director briefs each executive over BAND.
    await Promise.all(
      s.personas.map((p) =>
        sendMessage(room, { from: "director", to: p.id, text: `Switch to ${assess.tactic}: seller is ${assess.performance} (${assess.reason}).`, kind: "whisper" }),
      ),
    );
  }

  s.turn = turn;
  await saveSession(s);
  await writeEvents(events);

  const res: TurnResponse = {
    turn,
    speaker,
    spokenLine: turns[speaker].spokenLine,
    gestures: Object.fromEntries(s.personas.map((p) => [p.id, turns[p.id].gesture])) as TurnResponse["gestures"],
    convictions: Object.fromEntries(s.personas.map((p) => [p.id, p.conviction])) as TurnResponse["convictions"],
    thoughts,
    factChecks,
    whisperPairs,
    adaptation: { tactic: assess.tactic, performance: assess.performance, reason: assess.reason, changed },
    done: turn >= MAX_TURNS,
  };
  return Response.json(res);
}
