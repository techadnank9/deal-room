import { currentSession, type Plan } from "@/lib/workspace";
import { APP_URL } from "@/lib/agent/runner";

export const runtime = "nodejs";

/**
 * Stripe Checkout for a plan. Needs STRIPE_SECRET_KEY plus STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH (recurring price ids).
 * The webhook (/api/billing/webhook) switches the workspace's plan when the subscription is paid.
 */
export async function POST(req: Request) {
  const s = await currentSession();
  if (!s) return Response.json({ error: "signed out" }, { status: 401 });
  const { plan } = (await req.json()) as { plan: Plan };
  const key = process.env.STRIPE_SECRET_KEY;
  const price = plan === "growth" ? process.env.STRIPE_PRICE_GROWTH : plan === "starter" ? process.env.STRIPE_PRICE_STARTER : undefined;
  if (!key || !price) return Response.json({ error: "Billing isn't switched on yet. Your free trial keeps working." }, { status: 400 });
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    customer_email: s.email,
    client_reference_id: s.workspace.id,
    "metadata[workspace]": s.workspace.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][workspace]": s.workspace.id,
    "subscription_data[metadata][plan]": plan,
    success_url: `${APP_URL}/app/settings?billing=success`,
    cancel_url: `${APP_URL}/app/settings?billing=cancelled`,
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = (await r.json()) as { url?: string; error?: { message?: string } };
  if (!r.ok || !j.url) return Response.json({ error: j.error?.message ?? "Couldn't start checkout" }, { status: 400 });
  return Response.json({ url: j.url });
}
