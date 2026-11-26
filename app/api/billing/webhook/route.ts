import { createHmac, timingSafeEqual } from "node:crypto";
import { updateWorkspace, type Plan } from "@/lib/workspace";

export const runtime = "nodejs";

/** Stripe webhook: checkout.session.completed → set the workspace's plan; subscription deleted → back to trial. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret) return new Response("billing not configured", { status: 400 });
  const sig = req.headers.get("stripe-signature") ?? "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const ok = parts.v1 && parts.v1.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  if (!ok || Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return new Response("bad signature", { status: 400 });
  const ev = JSON.parse(raw) as { type: string; data: { object: { metadata?: { workspace?: string; plan?: string } } } };
  const md = ev.data.object.metadata ?? {};
  if (md.workspace) {
    if (ev.type === "checkout.session.completed" && (md.plan === "starter" || md.plan === "growth")) await updateWorkspace(md.workspace, { plan: md.plan as Plan });
    if (ev.type === "customer.subscription.deleted") await updateWorkspace(md.workspace, { plan: "trial" });
  }
  return new Response("ok");
}
