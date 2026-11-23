import { withModel } from "@/lib/llm";
import { loadSession, saveSession, writeEvents } from "@/lib/db";
import { runRound } from "@/lib/agents/round";
import { MAX_TURNS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUIET_MS = 25000;

/** Agents act on their own when the humans have been quiet. Any connected client may call it; the server dedupes. */
export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };
  const current = await loadSession(id);
  return withModel(current?.model, async () => {
    const s = await loadSession(id);
    if (!s || s.status !== "active" || s.turn >= MAX_TURNS) return Response.json({ acted: false });
    const quietSince = Math.max(s.lastHumanAt ?? 0, Date.parse(s.createdAt));
    // One autonomous round per silence; humans always get the floor back first.
    if (s.turn === 0 || (s.autoStreak ?? 0) >= 1 || Date.now() - quietSince < QUIET_MS || (s.busyUntil ?? 0) > Date.now()) return Response.json({ acted: false });
    s.busyUntil = Date.now() + 60000;
    s.lastHumanAt = Date.now(); // reset the quiet timer so agents don't act every poll
    await saveSession(s);
    const { events, res } = await runRound(s, { auto: true });
    s.autoStreak = (s.autoStreak ?? 0) + 1;
    s.busyUntil = 0;
    await saveSession(s);
    await writeEvents(events);
    return Response.json({ acted: true, ...res });
  });
}
