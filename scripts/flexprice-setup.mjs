// One-time Flexprice setup for the GTM Engine: metered features, a usage plan, the demo customer,
// a subscription and a prepaid credit wallet. Safe to re-run: it reuses what already exists.
// Run: node --env-file=.env.local scripts/flexprice-setup.mjs
const BASE = process.env.FLEXPRICE_BASE_URL || "https://us.api.flexprice.io/v1";
const KEY = process.env.FLEXPRICE_API_KEY;
if (!KEY) throw new Error("FLEXPRICE_API_KEY missing");
const CUSTOMER = process.env.FLEXPRICE_CUSTOMER_ID || "dealroom-demo";

async function fp(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

// event_name -> price per event in USD
const FEATURES = [
  { event: "lead_enriched", name: "Leads Enriched", unit: "lead", amount: "0.50" },
  { event: "outreach_sent", name: "Outreach Sent", unit: "message", amount: "0.25" },
  { event: "graph_query", name: "Graph Queries Evaluated", unit: "query", amount: "0.02" },
  { event: "search_query", name: "Moss Searches", unit: "search", amount: "0.01" },
];

const existing = (await fp("GET", "/features?limit=100")).items ?? [];
const features = [];
for (const f of FEATURES) {
  let feat = existing.find((x) => x.lookup_key === f.event || x.meter?.event_name === f.event);
  if (!feat) {
    feat = await fp("POST", "/features", {
      name: f.name,
      type: "metered",
      lookup_key: f.event,
      unit_singular: f.unit,
      unit_plural: `${f.unit}s`,
      meter: { name: `${f.name} meter`, event_name: f.event, aggregation: { type: "COUNT" }, reset_usage: "BILLING_PERIOD" },
    });
    console.log("created feature", f.event, feat.id);
  }
  features.push({ ...f, id: feat.id, meterId: feat.meter_id ?? feat.meter?.id });
}

const plans = (await fp("GET", "/plans?limit=100")).items ?? [];
let plan = plans.find((p) => p.lookup_key === "gtm-engine-usage");
if (!plan) {
  plan = await fp("POST", "/plans", { name: "GTM Engine Usage", lookup_key: "gtm-engine-usage", description: "Pay per lead enriched, message sent and graph query" });
  console.log("created plan", plan.id);
  for (const f of features) {
    await fp("POST", "/prices", {
      amount: f.amount,
      currency: "usd",
      entity_type: "PLAN",
      entity_id: plan.id,
      type: "USAGE",
      meter_id: f.meterId,
      billing_model: "FLAT_FEE",
      billing_period: "MONTHLY",
      billing_period_count: 1,
      invoice_cadence: "ARREAR",
      price_unit_type: "FIAT",
      display_name: f.name,
    });
    console.log("price", f.event, f.amount);
  }
}

let customer;
try {
  customer = await fp("GET", `/customers/external/${CUSTOMER}`);
} catch {
  customer = await fp("POST", "/customers", { external_id: CUSTOMER, name: "Deal Room demo workspace" });
  console.log("created customer", customer.id);
}

const subs = await fp("GET", `/customers/external/${CUSTOMER}/subscriptions`).catch(() => ({ items: [] }));
if (!(subs.items ?? subs.subscriptions ?? []).length) {
  const sub = await fp("POST", "/subscriptions", {
    customer_id: customer.id,
    plan_id: plan.id,
    currency: "usd",
    billing_period: "MONTHLY",
    billing_cadence: "RECURRING",
    start_date: new Date().toISOString(),
  });
  console.log("created subscription", sub.id);
}

const wallets = await fp("GET", `/customers/${customer.id}/wallets`).catch(() => []);
let wallet = (Array.isArray(wallets) ? wallets : wallets.items ?? [])[0];
if (!wallet) {
  wallet = await fp("POST", "/wallets", { customer_id: customer.id, currency: "usd", name: "GTM credits", conversion_rate: "1" });
  console.log("created wallet", wallet.id);
  await fp("POST", `/wallets/${wallet.id}/top-up`, { credits_to_add: "25", transaction_reason: "FREE_CREDIT_GRANT", description: "Hackathon starter credits" });
  console.log("topped up 25 credits");
}
const bal = await fp("GET", `/wallets/${wallet.id}/balance/real-time`).catch((e) => ({ error: e.message }));
console.log("wallet", wallet.id, JSON.stringify(bal).slice(0, 300));
