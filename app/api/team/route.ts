import { bookMeeting, loadTeam, removeLead, pruneCompetitors, teamSetup, teamTurn, withCompany } from "@/lib/agents/team";
import { writeEvents } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?url= / body.url names your company: each company has its own team room.
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? undefined;
  return Response.json(await withCompany(url, loadTeam));
}

/** Talk to your team. The right teammate answers and does the work. */
export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string; setupUrl?: string };
  return withCompany(body.setupUrl || body.url, () => handle(body));
}

async function handle(body: unknown) {
  const { text, player, offering, setupUrl, prune, book, remove } = body as { text?: string; player?: string; offering?: string; setupUrl?: string; prune?: boolean; book?: string; remove?: string };
  if (prune) return Response.json({ removed: await pruneCompetitors(), state: await loadTeam() });
  if (remove) return Response.json({ state: await removeLead(remove) });
  if (book) return Response.json(await bookMeeting(book, (player || "You").trim()));
  if (setupUrl?.trim()) return Response.json(await teamSetup(setupUrl.trim(), (player || "there").trim()));
  if (!text?.trim()) return Response.json({ error: "say something" }, { status: 400 });
  const r = await teamTurn(text.trim(), (player || "You").trim(), offering);
  await writeEvents([
    { session_id: "team", turn: 0, actor: "user", event_type: "utterance", text: text.trim() },
    { session_id: "team", turn: 0, actor: r.speaker, event_type: "utterance", text: r.line, target: r.found ? `found ${r.found.length} leads` : r.email ? `email ${r.email.company}` : null },
  ]);
  return Response.json(r);
}
