import { loadSession, saveSession, writeEvents } from "@/lib/db";
import { PLAYER_COLORS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A human player joins the shared room by name. */
export async function POST(req: Request) {
  const { id, name } = (await req.json()) as { id: string; name: string };
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  const clean = (name || "").trim().slice(0, 24);
  if (!clean) return Response.json({ error: "name required" }, { status: 400 });
  s.players ??= [];
  if (!s.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    s.players.push({ name: clean, color: PLAYER_COLORS[s.players.length % PLAYER_COLORS.length], joinedAt: new Date().toISOString() });
    s.seq = (s.seq ?? 0) + 1;
    (s.log ??= []).push({ key: `join-${s.seq}`, turn: s.turn, actor: "user", action: `${clean} joins the selling team` });
    await saveSession(s);
    await writeEvents([{ session_id: id, turn: s.turn, actor: "user", event_type: "join", text: clean }]);
  }
  return Response.json({ players: s.players });
}
