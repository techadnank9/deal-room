import { loadSession, saveSession, writeEvents } from "@/lib/db";
import { castVote } from "@/lib/agents/verdict";
import { coachFixes } from "@/lib/agents/coach";
import { runBruin } from "@/lib/bruin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  if (s.status === "finished" && s.votes) return Response.json({ votes: s.votes, fixes: s.fixes ?? [], bruin: null });

  const votes = await Promise.all(s.personas.map((p) => castVote(p, s)));
  s.votes = votes;
  s.status = "finished";
  s.fixes = await coachFixes(s);
  await saveSession(s);
  await writeEvents(
    votes.map((v) => {
      const p = s.personas.find((x) => x.id === v.id)!;
      return {
        session_id: id,
        turn: s.turn,
        actor: v.id,
        event_type: "vote",
        status: v.vote,
        text: v.reason,
        target: String(v.decisiveTurn),
        conviction_before: p.conviction,
        conviction_after: p.conviction,
      };
    }),
  );
  const bruin = await runBruin();
  return Response.json({ votes, fixes: s.fixes, bruin });
}
