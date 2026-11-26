import { currentSession, PLANS, updateWorkspace, usageThisMonth, usageToday, type AgentSettings } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const [today, month] = await Promise.all([usageToday(s.workspace.id), usageThisMonth(s.workspace.id)]);
  return Response.json({ email: s.email, name: s.name, workspace: s.workspace, plan: PLANS[s.workspace.plan], usage: { today, month } });
}

export async function PATCH(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const b = (await req.json()) as { name?: string; url?: string; settings?: Partial<AgentSettings> };
  return Response.json({ workspace: await updateWorkspace(s.workspace.id, { name: b.name, url: b.url, settings: b.settings }) });
}
