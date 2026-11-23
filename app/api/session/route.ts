import { randomUUID } from "node:crypto";
import { listSessions, loadSession, saveSession, writeEvents } from "@/lib/db";
import { buildBriefAndPersonas } from "@/lib/agents/personas";
import { domainOf, researchAccount } from "@/lib/sponsors/telem";
import { enrichCompany } from "@/lib/sponsors/glasser";
import { openRoom } from "@/lib/sponsors/band";
import { backdropPrompt, generateImage, runwareEnabled } from "@/lib/sponsors/runware";
import type { ResearchSource, SessionState } from "@/lib/types";
import { readCache, writeCache } from "@/lib/cache";
import type { Enrichment } from "@/lib/sponsors/glasser";

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

  let [research, enrichment] = await Promise.all([researchAccount(url), enrichCompany(domain)]);
  const memory = await accountMemory(domain);
  // Offline fallback: reuse the last real research for this domain when a sponsor call failed.
  if (research.provider === "telem") writeCache("research", domain, research);
  else {
    const cached = readCache<{ sources: ResearchSource[]; provider: string }>("research", domain);
    if (cached) research = { sources: cached.sources, provider: `cache:${cached.provider}` };
  }
  if (enrichment.provider === "glasser") writeCache("enrichment", domain, enrichment);
  else {
    const cached = readCache<{ data: Enrichment; provider: string }>("enrichment", domain);
    if (cached) enrichment = { data: cached.data, provider: `cache:${cached.provider}` };
  }

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
    imagesPending: runwareEnabled(),
  };
  await saveSession(session);
  if (runwareEnabled()) void generateArt(session);
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

/** Runware: window backdrop + one portrait per executive, generated in the background. */
async function generateArt(s: SessionState) {
  const portraitPrompt = (p: SessionState["personas"][number]) =>
    `Professional corporate headshot photo of ${p.name}, ${p.title}, ${p.personality} Neutral warm studio background, natural light, 85mm, realistic skin, business attire.`;
  const [backdrop, ...faces] = await Promise.all([
    generateImage(backdropPrompt(s.brief.company), 1024, 512),
    ...s.personas.map((p) => generateImage(portraitPrompt(p), 512, 640)),
  ]);
  const fresh = await loadSession(s.id);
  if (!fresh) return;
  fresh.backdropUrl = backdrop;
  fresh.portraits = Object.fromEntries(s.personas.map((p, i) => [p.id, faces[i] ?? undefined]).filter(([, u]) => u));
  fresh.imagesPending = false;
  await saveSession(fresh);
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const s = await loadSession(id);
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ session: s });
}
