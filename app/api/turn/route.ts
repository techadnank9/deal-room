import { withModel } from "@/lib/llm";
import { loadSession, saveSession, writeEvents } from "@/lib/db";
import { runRound } from "@/lib/agents/round";

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
    const { events, res } = await runRound(s, { player: body.player, utterance: body.text });
    s.busyUntil = 0;
    await saveSession(s);
    await writeEvents(events);
    return Response.json(res);
  }
}
