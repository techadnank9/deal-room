// Flexprice (https://docs.flexprice.io): usage metering + prepaid credits for the GTM Engine.
// Setup (features, plan, customer, subscription, wallet) is done once by scripts/flexprice-setup.mjs.
// Every billable action sends a usage event; the wallet's real-time balance gates costly work (enrichment).
// No FLEXPRICE_API_KEY: a local ledger with the same prices stands in, so the demo still gates.

const BASE = process.env.FLEXPRICE_BASE_URL || "https://us.api.flexprice.io/v1";
export const CUSTOMER = process.env.FLEXPRICE_CUSTOMER_ID || "dealroom-demo";

export type Metered = "lead_enriched" | "outreach_sent" | "graph_query" | "search_query";
export const PRICES: Record<Metered, number> = { lead_enriched: 0.5, outreach_sent: 0.25, graph_query: 0.02, search_query: 0.01 };
export const LABELS: Record<Metered, string> = {
  lead_enriched: "Leads enriched",
  outreach_sent: "Outreach sent",
  graph_query: "Graph queries",
  search_query: "Moss searches",
};

type Ledger = { counts: Record<Metered, number>; recent: { event: Metered; at: string; detail?: string }[]; balance?: number; balanceAt?: number; walletId?: string; optimistic?: number };
const g = globalThis as unknown as { __fp?: Ledger };
const ledger: Ledger = (g.__fp ??= { counts: { lead_enriched: 0, outreach_sent: 0, graph_query: 0, search_query: 0 }, recent: [] });
const LOCAL_START = 25;

export function flexpriceEnabled() {
  return Boolean(process.env.FLEXPRICE_API_KEY);
}

async function fp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": process.env.FLEXPRICE_API_KEY!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`flexprice ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Record one billable action. Never throws: billing must not break the pipeline. */
export async function meter(event: Metered, props: Record<string, string> = {}, detail?: string) {
  ledger.counts[event]++;
  ledger.recent.unshift({ event, at: new Date().toISOString(), detail });
  ledger.recent = ledger.recent.slice(0, 50);
  // Flexprice nets events into the real-time balance a few seconds late: show the charge at once and never let a lagging read raise it.
  if (ledger.balance !== undefined) {
    ledger.optimistic = Math.max(0, (ledger.optimistic ?? ledger.balance) - PRICES[event]);
    ledger.balance = Math.min(ledger.balance, ledger.optimistic);
  }
  if (!flexpriceEnabled()) return;
  try {
    await fp("POST", "/events", { event_name: event, external_customer_id: CUSTOMER, properties: props, source: "deal-room-gtm" });
  } catch (err) {
    console.error("[flexprice] meter failed:", err instanceof Error ? err.message : err);
  }
}

async function walletId(): Promise<string | undefined> {
  if (ledger.walletId) return ledger.walletId;
  const c = await fp<{ id: string }>("GET", `/customers/external/${CUSTOMER}`);
  const w = await fp<{ id: string }[] | { items?: { id: string }[] }>("GET", `/customers/${c.id}/wallets`);
  ledger.walletId = (Array.isArray(w) ? w : (w.items ?? []))[0]?.id;
  return ledger.walletId;
}

/** Real-time credit balance (USD credits), cached for 4 s. */
export async function balance(force = false): Promise<number> {
  if (!flexpriceEnabled()) {
    const spent = (Object.keys(PRICES) as Metered[]).reduce((s, k) => s + ledger.counts[k] * PRICES[k], 0);
    return Math.max(0, LOCAL_START - spent);
  }
  if (!force && ledger.balance !== undefined && Date.now() - (ledger.balanceAt ?? 0) < 4000) return ledger.balance;
  try {
    const id = await walletId();
    if (!id) throw new Error("no wallet (run scripts/flexprice-setup.mjs)");
    const b = await fp<{ real_time_balance?: string; real_time_credit_balance?: string; balance?: string }>("GET", `/wallets/${id}/balance/real-time`);
    const real = Number(b.real_time_credit_balance ?? b.real_time_balance ?? b.balance ?? 0);
    if (force || ledger.optimistic === undefined || real < ledger.optimistic) ledger.optimistic = real;
    ledger.balance = Math.min(real, ledger.optimistic);
    ledger.balanceAt = Date.now();
  } catch (err) {
    console.error("[flexprice] balance failed:", err instanceof Error ? err.message : err);
  }
  return ledger.balance ?? 0;
}

/** Credit gate: can we afford `n` of this action right now? */
export async function canSpend(event: Metered, n = 1) {
  return (await balance()) >= PRICES[event] * n;
}

export async function topUp(credits: number) {
  if (!flexpriceEnabled()) {
    ledger.counts.lead_enriched = Math.max(0, ledger.counts.lead_enriched - Math.round(credits / PRICES.lead_enriched));
    return balance(true);
  }
  const id = await walletId();
  await fp("POST", `/wallets/${id}/top-up`, { credits_to_add: String(credits), transaction_reason: "FREE_CREDIT_GRANT", description: "Top-up from GTM Engine" });
  return balance(true);
}

/** Drain the wallet to show the gate (demo button). */
export async function drain() {
  if (!flexpriceEnabled()) {
    ledger.counts.lead_enriched += 1000;
    return 0;
  }
  const id = await walletId();
  const b = await balance(true);
  if (b > 0.01) {
    await fp("POST", `/wallets/${id}/debit`, { credits: String(b.toFixed(2)), transaction_reason: "MANUAL_BALANCE_DEBIT", description: "Demo: spend all credits" }).catch(async () => {
      // No debit endpoint on this plan: burn credits with enrichment events instead.
      const n = Math.ceil(b / PRICES.lead_enriched);
      await fp("POST", "/events/bulk", {
        events: Array.from({ length: n }, () => ({ event_name: "lead_enriched", external_customer_id: CUSTOMER, properties: { demo: "drain" }, source: "deal-room-gtm" })),
      });
    });
  }
  ledger.balance = 0;
  ledger.optimistic = 0;
  ledger.balanceAt = Date.now();
  return 0;
}

export async function usage() {
  return {
    provider: flexpriceEnabled() ? "flexprice" : "local",
    customer: CUSTOMER,
    balance: await balance(),
    counts: { ...ledger.counts },
    prices: PRICES,
    labels: LABELS,
    recent: ledger.recent.slice(0, 15),
  };
}
