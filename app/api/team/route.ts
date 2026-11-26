import { bookMeeting, loadTeam, removeLead, pruneCompetitors, teamSetup, teamTurn, withCompany } from "@/lib/agents/team";
import { writeEvents } from "@/lib/db";
import { withModel } from "@/lib/llm";
import { resolveScope } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?url= / body.url names your company: each company has its own team room.
export async function GET(req: Request) {
  const scope = await resolveScope(new URL(req.url).searchParams.get("url"));
  if ("error" in scope) return Response.json({ error: scope.error }, { status: scope.status });
  return Response.json(await withCompany(scope.domain, loadTeam));
}

/** Talk to your team. The right teammate answers and does the work. */
export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string; setupUrl?: string; auto?: boolean };
  // You talking: the fast top model (default). Background work (lead picks, emails): the deepest model, since nobody waits on it.
  const scope = await resolveScope(body.setupUrl || body.url);
  if ("error" in scope) return Response.json({ error: scope.error }, { status: scope.status });
  return withCompany(scope.domain, () => withModel(body.auto ? "gpt-6.2-astra" : undefined, () => handle(body)));
}

async function handle(body: unknown) {
  const { text, player, offering, setupUrl, prune, book, remove, quick, auto } = body as { text?: string; player?: string; offering?: string; setupUrl?: string; prune?: boolean; book?: string; remove?: string; quick?: boolean; auto?: boolean };
  if (prune) return Response.json({ removed: await pruneCompetitors(), state: await loadTeam() });
  if (remove) return Response.json({ state: await removeLead(remove) });
  if (book) return Response.json(await bookMeeting(book, (player || "You").trim()));
  if (setupUrl?.trim()) return Response.json(await teamSetup(setupUrl.trim(), (player || "there").trim(), !quick));
  if (!text?.trim()) return Response.json({ error: "say something" }, { status: 400 });
  const r = await teamTurn(text.trim(), (player || "You").trim(), offering, Boolean(auto));
  await writeEvents([
    { session_id: "team", turn: 0, actor: "user", event_type: "utterance", text: text.trim() },
    { session_id: "team", turn: 0, actor: r.speaker, event_type: "utterance", text: r.line, target: r.found ? `found ${r.found.length} leads` : r.email ? `email ${r.email.company}` : null },
  ]);
  return Response.json(r);
}
