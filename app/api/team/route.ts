import { loadTeam, pruneCompetitors, teamSetup, teamTurn } from "@/lib/agents/team";
import { writeEvents } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadTeam());
}

/** Talk to your team. The right teammate answers and does the work. */
export async function POST(req: Request) {
  const { text, player, offering, setupUrl, prune } = (await req.json()) as { text?: string; player?: string; offering?: string; setupUrl?: string; prune?: boolean };
  if (prune) return Response.json({ removed: await pruneCompetitors(), state: await loadTeam() });
  if (setupUrl?.trim()) return Response.json(await teamSetup(setupUrl.trim(), (player || "there").trim()));
  if (!text?.trim()) return Response.json({ error: "say something" }, { status: 400 });
  const r = await teamTurn(text.trim(), (player || "You").trim(), offering);
  await writeEvents([
    { session_id: "team", turn: 0, actor: "user", event_type: "utterance", text: text.trim() },
    { session_id: "team", turn: 0, actor: r.speaker, event_type: "utterance", text: r.line, target: r.found ? `found ${r.found.length} leads` : r.email ? `email ${r.email.company}` : null },
  ]);
  return Response.json(r);
}
