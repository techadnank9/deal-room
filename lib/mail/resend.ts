// Resend as a mailbox: send through the Resend API from a verified domain, and receive replies,
// bounces and complaints through a Resend webhook (no IMAP). The API key is stored sealed like a password.
import { createHmac, timingSafeEqual } from "node:crypto";
import type Mail from "nodemailer/lib/mailer";
import { open } from "./crypto";
import type { Inbound, Mailbox, OutboundMessage, SendResult, VerifyResult } from "./types";

const API = "https://api.resend.com";

async function call<T>(box: Mailbox, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${open(box.passSealed)}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { message?: string; name?: string };
  if (!r.ok) throw new Error(`Resend ${r.status}: ${j.message ?? j.name ?? "request failed"}`);
  return j;
}

const str = (a: OutboundMessage["to"]): string => (typeof a === "string" ? a : Array.isArray(a) ? str(a[0] as Mail.Address) : ((a as Mail.Address | undefined)?.address ?? ""));

export async function sendViaResend(box: Mailbox, msg: OutboundMessage): Promise<SendResult> {
  const name = typeof msg.from === "object" && msg.from && "name" in msg.from ? msg.from.name : box.fromName;
  const headers: Record<string, string> = { ...((msg.headers as Record<string, string>) ?? {}) };
  if (msg.messageId) headers["Message-ID"] = String(msg.messageId);
  if (msg.inReplyTo) headers["In-Reply-To"] = String(msg.inReplyTo);
  if (msg.references) headers["References"] = Array.isArray(msg.references) ? msg.references.join(" ") : String(msg.references);
  const to = str(msg.to);
  await call<{ id: string }>(box, "/emails", {
    method: "POST",
    body: JSON.stringify({
      from: `${(name || box.fromName).replace(/[<>"]/g, "")} <${box.email}>`,
      to: [to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      reply_to: box.replyTo || box.email,
      headers,
    }),
  });
  return { messageId: String(msg.messageId ?? ""), accepted: [to], rejected: [] };
}

/** The key works and the From domain is verified in Resend. */
export async function verifyResend(box: Mailbox): Promise<VerifyResult> {
  try {
    const r = await call<{ data: { name: string; status: string }[] }>(box, "/domains");
    const dom = box.email.split("@")[1]?.toLowerCase();
    const d = r.data.find((x) => x.name.toLowerCase() === dom);
    if (!d) return { ok: false, smtp: `${dom} is not a domain in this Resend account.`, imap: "-" };
    if (d.status !== "verified") return { ok: false, smtp: `${dom} is ${d.status} in Resend, not verified yet.`, imap: "-" };
    return { ok: true, smtp: "ok", imap: box.webhookSecretSealed ? "ok (webhook)" : "add the webhook signing secret to track replies" };
  } catch (e) {
    return { ok: false, smtp: e instanceof Error ? e.message : String(e), imap: "-" };
  }
}

/** Verify a Resend (Svix) webhook signature. */
export function verifyResendWebhook(secret: string, id: string, timestamp: string, signature: string, payload: string): boolean {
  if (!id || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 600) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signature.split(" ").some((s) => {
    const b = Buffer.from(s.split(",")[1] ?? "", "base64");
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

type Received = { id: string; from: string; to: string[]; subject: string; text?: string; html?: string; created_at: string; message_id?: string; headers?: Record<string, string> };

/** Fetch a received email and shape it like an IMAP message. */
export async function fetchReceived(box: Mailbox, emailId: string): Promise<Inbound> {
  const e = await call<Received>(box, `/emails/receiving/${emailId}`);
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.headers ?? {})) h[k.toLowerCase()] = String(v);
  const from = (e.from.match(/<([^>]+)>/)?.[1] ?? e.from).trim().toLowerCase();
  const text = e.text ?? (e.html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
  return {
    uid: 0,
    messageId: e.message_id ?? h["message-id"] ?? e.id,
    inReplyTo: h["in-reply-to"],
    references: (h["references"] ?? "").split(/\s+/).filter(Boolean),
    from,
    fromName: e.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || undefined,
    subject: e.subject ?? "",
    date: e.created_at,
    text,
    headers: h,
  };
}
