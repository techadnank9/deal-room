import { withModel } from "@/lib/llm";
import { loadSession, saveSession, writeEvents } from "@/lib/db";
import { runRound } from "@/lib/agents/round";
import { analystBriefing, calledExec, wantsAnalyst } from "@/lib/agents/analyst";
import type { ExecId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A human player speaks. Every player in the room sees the result via polling. */
export async function POST(req: Request) {
  const body = (await req.json()) as { id: string; text: string; player?: string };
  const current = await loadSession(body.id);
  return withModel(current?.model, async () => {
    const s = await loadSession(body.id);
    if (!s) return Response.json({ error: "not found" }, { status: 404 });
    if (s.status !== "active") return Response.json({ error: "session finished" }, { status: 409 });
    if (!(body.text || "").trim()) return Response.json({ error: "empty utterance" }, { status: 400 });
    // If the agents are mid-round, wait for them (up to 40s) instead of rejecting the human.
    let cur = s;
    for (let i = 0; i < 20 && (cur.busyUntil ?? 0) > Date.now(); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      cur = (await loadSession(body.id)) ?? cur;
    }
    cur.busyUntil = Date.now() + 60000;
    cur.autoStreak = 0;
    await saveSession(cur);
    return finish(cur, body);
  });
}

async function finish(s: Awaited<ReturnType<typeof loadSession>> & object, body: { id: string; text: string; player?: string }) {
  {
    s.lastHumanAt = Date.now();
    const player = body.player || s.players?.[0]?.name || "Seller";
    const called = calledExec(body.text, s) as ExecId | null;
    if (!called && wantsAnalyst(body.text)) {
      // The analyst walks over, pulls up the CRM and drafts the follow-up email.
      const b = await analystBriefing(s, body.text, player);
      const seq = (s.seq ?? 0) + 1;
      s.seq = seq;
      s.transcript.push({ turn: s.turn, speaker: player, text: body.text });
      s.transcript.push({ turn: s.turn, speaker: "analyst", text: b.spoken });
      (s.log ??= []).push(
        { key: `${seq}-0`, turn: s.turn, actor: "user", action: `${player} calls the analyst`, detail: body.text },
        { key: `${seq}-1`, turn: s.turn, actor: "analyst", action: "pulls up the CRM and drafts a follow-up", detail: b.spoken, reason: `Email to ${b.email.to}: ${b.email.subject}` },
      );
      s.live = { speaker: "analyst", line: b.spoken, gestures: {}, gestureAt: Date.now(), check: null, whispers: [], event: null, approach: "analyst", crm: b };
      s.busyUntil = 0;
      await saveSession(s);
      await writeEvents([
        { session_id: s.id, turn: s.turn, actor: "user", event_type: "utterance", text: `${player}: ${body.text}` },
        { session_id: s.id, turn: s.turn, actor: "analyst", event_type: "utterance", text: b.spoken, target: "crm_briefing" },
      ]);
      return Response.json({ analyst: true, spokenLine: b.spoken, crm: b });
    }
    const { events, res } = await runRound(s, { player: body.player, utterance: body.text, called });
    s.busyUntil = 0;
    await saveSession(s);
    await writeEvents(events);
    return Response.json(res);
  }
}
