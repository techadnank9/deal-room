import { loadTeam, withCompany } from "@/lib/agents/team";
import { saveAgentSettings, importLeads, analytics, reindexAll, buildIcp, decideExpansion, decideTouch, draftSequence, enrichLead, graph, mapCompetitors, memorySearch, moveStage } from "@/lib/gtm/engine";
import type { Persona, Stage } from "@/lib/gtm/types";
import { generatePersonas, savePersonas } from "@/lib/gtm/personas";
import { drain, topUp, usage } from "@/lib/sponsors/flexprice";
import { mossEnabled } from "@/lib/sponsors/moss";
import { withModel } from "@/lib/llm";
import { resolveScope } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Everything the GTM page shows: team state + analytics + Flexprice usage. ?graph=1 also runs the graph queries. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const scope = await resolveScope(sp.get("url"));
  if ("error" in scope) return Response.json({ error: scope.error }, { status: scope.status });
  return withCompany(scope.domain, async () => {
    const t = await loadTeam();
    const [billing, g] = await Promise.all([usage(), sp.get("graph") ? graph() : Promise.resolve(null)]);
    return Response.json({ state: t, analytics: analytics(t), billing, graph: g, moss: mossEnabled() ? "moss" : "local" });
  });
}

type Body = {
  url?: string;
  action: "intake" | "expansion" | "competitors" | "enrich" | "draft" | "touch" | "stage" | "search" | "topup" | "drain" | "reindex" | "personas" | "savePersonas" | "agentSettings" | "import" | "block" | "unblock" | "blocklist" | "bulk";
  targeting?: import("@/lib/gtm/types").Targeting;
  campaign?: import("@/lib/gtm/types").CampaignSettings;
  knowledge?: import("@/lib/gtm/types").Knowledge;
  rows?: { company?: string; domain?: string; name?: string; title?: string; email?: string }[];
  entry?: string;
  leadIds?: string[];
  personas?: Persona[];
  confirm?: boolean;
  intake?: { product: string; customers: string; pricing: string; constraints: string };
  id?: string;
  status?: "accepted" | "dismissed" | "suggested";
  leadId?: string;
  touchId?: string;
  decision?: "approve" | "reject" | "edit";
  edit?: { subject?: string; body?: string };
  stage?: Stage;
  q?: string;
  credits?: number;
};

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const scope = await resolveScope(b.url);
  if ("error" in scope) return Response.json({ error: scope.error }, { status: scope.status });
  return withCompany(scope.domain, () =>
    withModel(undefined, async () => {
      switch (b.action) {
        case "intake":
          return Response.json({ state: await buildIcp(b.intake!) });
        case "expansion":
          return Response.json({ state: await decideExpansion(b.id!, b.status!) });
        case "competitors":
          return Response.json({ state: await mapCompetitors() });
        case "enrich":
          return Response.json({ state: await enrichLead(b.leadId!, "rep") });
        case "draft":
          return Response.json({ state: await draftSequence(b.leadId!) });
        case "touch":
          return Response.json({ state: await decideTouch(b.leadId!, b.touchId!, b.decision!, b.edit) });
        case "stage":
          return Response.json({ state: await moveStage(b.leadId!, b.stage!, "rep") });
        case "search":
          return Response.json(await memorySearch(b.q ?? ""));
        case "topup":
          return Response.json({ balance: await topUp(b.credits ?? 10) });
        case "agentSettings":
          return Response.json({ state: await saveAgentSettings({ targeting: b.targeting, campaign: b.campaign, knowledge: b.knowledge }) });
        case "import": {
          const n = await importLeads(b.rows ?? []);
          const t = await loadTeam();
          void import("@/lib/gtm/engine").then((m) => m.onLeadsFound(t.leads.slice(0, n)));
          return Response.json({ imported: n, state: t });
        }
        case "block":
        case "unblock":
        case "blocklist": {
          if (!scope.workspace) return Response.json({ error: "Log in to manage your do-not-contact list." }, { status: 401 });
          const store = await import("@/lib/agent/store");
          const e = (b.entry ?? "").trim().toLowerCase();
          if (b.action === "block" && e) await store.suppress(scope.workspace.id, e.includes("@") && !e.startsWith("@") ? e : `@${e.replace(/^@/, "")}`, "manual");
          if (b.action === "unblock" && e) await store.unsuppress(scope.workspace.id, e);
          return Response.json({ blocked: await store.listSuppression(scope.workspace.id) });
        }
        case "bulk": {
          const t = await loadTeam();
          for (const id of b.leadIds ?? []) {
            const l = t.leads.find((x) => x.id === id);
            for (const m of l?.sequence ?? []) if (m.approval === "pending" && (m.channel === "email" || b.decision !== "approve")) await decideTouch(id, m.id, b.decision === "approve" ? "approve" : "reject");
            if (b.decision === "reject") await moveStage(id, "lost", "rep");
          }
          return Response.json({ state: await loadTeam() });
        }
        case "personas":
          await generatePersonas();
          return Response.json({ state: await loadTeam() });
        case "savePersonas":
          return Response.json({ state: await savePersonas(b.personas ?? [], Boolean(b.confirm)) });
        case "reindex":
          return Response.json({ indexed: await reindexAll() });
        case "drain":
          return Response.json({ balance: await drain() });
        default:
          return Response.json({ error: "unknown action" }, { status: 400 });
      }
    }),
  );
}
