// Outgoing integrations: Slack reply alerts and a generic webhook for lead events.
import { createHmac } from "node:crypto";
import type { Prefs } from "./gtm/types";
import { recordTrace } from "./trace";

const APP = process.env.APP_URL || "https://deelroomlive.onrender.com";

export async function slackReply(prefs: Prefs | undefined, r: { from: string; company?: string; category: string; text: string; draft?: string | null }) {
  const url = prefs?.slackWebhook?.trim();
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) return;
  const label: Record<string, string> = { interested: "🔥 Interested", not_now: "⏳ Not now", referral: "↪️ Referral", unsubscribe: "🚫 Unsubscribed", not_interested: "👋 Not interested", bounce: "⚠️ Bounced", other: "💬 Reply" };
  const text = `*${label[r.category] ?? "💬 Reply"}* from ${r.from}${r.company ? ` (${r.company})` : ""}\n>${r.text.slice(0, 600).replace(/\n/g, "\n>")}${r.draft ? `\n\n*Drafted answer:*\n${r.draft.slice(0, 800)}` : ""}\n<${APP}/app/inbox|Open the inbox to send it>`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  await recordTrace({ kind: "tool", label: "slack: reply alert", ok: Boolean(res?.ok), input: { from: r.from, category: r.category }, error: res?.ok ? undefined : `Slack ${res?.status ?? "unreachable"}` });
}

/** POST {event, at, data} to the customer's endpoint, signed with X-DealRoom-Signature (HMAC-SHA256 of the body, keyed by the URL). */
export async function emitEvent(prefs: Prefs | undefined, event: "lead.found" | "email.sent" | "reply.received", data: Record<string, unknown>) {
  const url = prefs?.webhookUrl?.trim();
  if (!url || !/^https:\/\//.test(url)) return;
  const body = JSON.stringify({ event, at: new Date().toISOString(), data });
  const sig = createHmac("sha256", url).update(body).digest("hex");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-DealRoom-Event": event, "X-DealRoom-Signature": sig }, body, signal: AbortSignal.timeout(8000) }).catch(() => null);
  await recordTrace({ kind: "tool", label: `webhook: ${event}`, ok: Boolean(res?.ok), input: data, error: res?.ok ? undefined : `HTTP ${res?.status ?? "unreachable"}` });
}
