import { randomUUID } from "node:crypto";
import { listSessions, loadSession, saveSession, writeEvents } from "@/lib/db";
import { buildBriefAndPersonas } from "@/lib/agents/personas";
import { domainOf, researchAccount } from "@/lib/sponsors/telem";
import { enrichCompany } from "@/lib/sponsors/glasser";
import { openRoom } from "@/lib/sponsors/band";
import type { SessionState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Memory across sessions: what happened in earlier rehearsals against the same account. */
async function accountMemory(domain: string): Promise<string> {
  const past = (await listSessions()).filter((s) => s.brief.domain === domain && s.status === "finished").slice(0, 3);
  return past
    .map((s, i) => {
      const votes = (s.votes ?? []).map((v) => `${v.id} voted ${v.vote}: ${v.reason}`).join("; ");
      const busted = s.claimChecks.filter((c) => c.status !== "verified").map((c) => `"${c.claim}" was ${c.status}`).join("; ");
      return `Rehearsal ${i + 1} (${s.createdAt.slice(0, 10)}): ${votes}${busted ? `. Claims that failed: ${busted}` : ""}`;
    })
    .join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string; offering?: string };
  const url = (body.url || "").trim();
  const offering = (body.offering || "").trim();
  if (!url || !offering) return Response.json({ error: "url and offering are required" }, { status: 400 });

  const id = randomUUID().slice(0, 8);
  const domain = domainOf(url);

  const [research, enrichment, memory] = await Promise.all([
    researchAccount(url),
    enrichCompany(domain),
    accountMemory(domain),
  ]);

  const { brief, personas, source } = await buildBriefAndPersonas({
    url,
    domain,
    offering,
    sources: research.sources,
    enrichment: enrichment.data as Record<string, unknown>,
    memory,
  });

  const band = await openRoom(id, ["cfo", "tech", "procurement", "analyst"]);

  const session: SessionState = {
    id,
    url,
    offering,
    brief: {
      ...brief,
      domain,
      sources: research.sources,
      enrichment: enrichment.data as Record<string, unknown>,
      researchProvider: research.provider,
      enrichmentProvider: enrichment.provider,
    },
    personas,
    transcript: [],
    whispers: [],
    claimChecks: [],
    turn: 0,
    status: "active",
    bandRoomId: band.roomId,
    bandProvider: band.provider,
    createdAt: new Date().toISOString(),
  };
  await saveSession(session);
  await writeEvents([
    {
      session_id: id,
      turn: 0,
      actor: "director",
      event_type: "session_started",
      text: `${brief.company} | ${offering} | llm=${source} research=${research.provider} enrich=${enrichment.provider} band=${band.provider}${memory ? " | memory=yes" : ""}`,
      source_url: url,
    },
    ...personas.map((p) => ({
      session_id: id,
      turn: 0,
      actor: p.id,
      event_type: "conviction_change",
      text: `${p.name} enters at ${p.conviction}`,
      conviction_before: p.conviction,
      conviction_after: p.conviction,
    })),
  ]);
  return Response.json({ id, session });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ session: s });
}
