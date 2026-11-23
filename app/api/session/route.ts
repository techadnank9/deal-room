import { randomUUID } from "node:crypto";
import { defaultModel, withModel } from "@/lib/llm";
import { listSessions, loadSession, saveSession, writeEvents } from "@/lib/db";
import { buildBriefAndPersonas } from "@/lib/agents/personas";
import { buildBreakdown } from "@/lib/agents/breakdown";
import { domainOf, researchAccount, researchSeller } from "@/lib/sponsors/telem";
import { enrichCompany } from "@/lib/sponsors/glasser";
import { openRoom } from "@/lib/sponsors/band";
import { backdropPrompt, generateImage, runwareEnabled } from "@/lib/sponsors/runware";
import type { ResearchSource, SessionState } from "@/lib/types";
import { readCache, writeCache } from "@/lib/cache";
import type { Enrichment } from "@/lib/sponsors/glasser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Memory across sessions: what happened in earlier meetings against the same account. */
async function accountMemory(domain: string): Promise<string> {
  const past = (await listSessions()).filter((s) => s.brief.domain === domain && s.status === "finished").slice(0, 3);
  return past
    .map((s, i) => {
      const votes = (s.votes ?? []).map((v) => `${v.id} voted ${v.vote}: ${v.reason}`).join("; ");
      const busted = s.claimChecks.filter((c) => c.status !== "verified").map((c) => `"${c.claim}" was ${c.status}`).join("; ");
      return `Meeting ${i + 1} (${s.createdAt.slice(0, 10)}): ${votes}${busted ? `. Claims that failed: ${busted}` : ""}`;
    })
    .join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string; offering?: string; model?: string; sellerUrl?: string };
  const model = (body.model || "").trim() || defaultModel();
  return withModel(model, () => create(body, model));
}

/** Change the model for a session at any point; the next turn uses it. */
export async function PATCH(req: Request) {
  const { id, model } = (await req.json()) as { id?: string; model?: string };
  const s = id ? await loadSession(id) : null;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  if (!model?.trim()) return Response.json({ error: "model required" }, { status: 400 });
  s.model = model.trim();
  await saveSession(s);
  await writeEvents([{ session_id: s.id, turn: s.turn, actor: "director", event_type: "speaker_pick", text: `model switched to ${s.model}` }]);
  return Response.json({ model: s.model });
}

async function create(body: { url?: string; offering?: string; sellerUrl?: string }, model: string) {
  const sellerUrl = (body.sellerUrl || "").trim();
  const url = (body.url || "").trim();
  const offering = (body.offering || "").trim();
  if (!url || !offering) return Response.json({ error: "url and offering are required" }, { status: 400 });

  const id = randomUUID().slice(0, 8);
  const domain = domainOf(url);

  const timed = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = Date.now();
    const v = await fn();
    return [v, Date.now() - t0];
  };
  const sellerJob = timed(() => researchSeller(sellerUrl, (body.offering || "").trim()));
  const [[research0, researchMs], [enrichment0, enrichMs]] = await Promise.all([timed(() => researchAccount(url)), timed(() => enrichCompany(domain))]);
  let research = research0;
  let enrichment = enrichment0;
  const [seller, sellerMs] = await sellerJob;
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

  const t1 = Date.now();
  const [{ brief, personas, source }, breakdown] = await Promise.all([
    buildBriefAndPersonas({ url, domain, offering, sources: research.sources, enrichment: enrichment.data as Record<string, unknown>, memory }),
    buildBreakdown({ company: domain, url, offering, sources: research.sources, enrichment: enrichment.data as Record<string, unknown> }),
  ]);
  const llmMs = Date.now() - t1;
  const kindCount = (k: string) => research.sources.filter((x) => (x.kind ?? "site") === k).length;
  const enrichFound = Object.values(enrichment.data as Record<string, unknown>).filter((v) => v && !String(v).includes("mock") && !(Array.isArray(v) && !v.length)).length;
  const breakdownItems = Object.values(breakdown).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  const steps = [
    { label: `Read ${domain} (Telem fetch)`, provider: research.provider, found: kindCount("site"), ms: researchMs },
    { label: "Search recent news (Telem search)", provider: research.provider, found: kindCount("news"), ms: researchMs },
    { label: "Search hiring signals (Telem search)", provider: research.provider, found: kindCount("hiring"), ms: researchMs },
    { label: "Search funding and customers (Telem search)", provider: research.provider, found: kindCount("funding"), ms: researchMs },
    { label: "Company size, funding, tech stack, people (Glasser)", provider: enrichment.provider, found: enrichFound, ms: enrichMs },
    ...(sellerUrl ? [{ label: `Research your company ${domainOf(sellerUrl)} (Telem)`, provider: seller.provider, found: seller.sources.length, ms: sellerMs }] : []),
    { label: "Write the business breakdown (analyst agent)", provider: source, found: breakdownItems, ms: llmMs },
    { label: "Build the buying committee from the research", provider: source, found: personas.length, ms: llmMs },
  ];

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
      seller: { url: sellerUrl, name: seller.name, sources: seller.sources, provider: seller.provider },
      breakdown,
      steps,
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
    model,
  };
  await saveSession(session);
  if (runwareEnabled()) void generateArt(session);
  await writeEvents([
    {
      session_id: id,
      turn: 0,
      actor: "director",
      event_type: "session_started",
      text: `${brief.company} | ${offering} | llm=${source}:${model} research=${research.provider} enrich=${enrichment.provider} band=${band.provider}${memory ? " | memory=yes" : ""}`,
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
    generateImage(backdropPrompt(s.brief.company, (s.brief.enrichment as { city?: string } | undefined)?.city), 1024, 512),
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
