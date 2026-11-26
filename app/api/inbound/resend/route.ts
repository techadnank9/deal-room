// Resend webhook: replies (email.received), bounces (email.bounced) and spam complaints (email.complained)
// for a workspace's Resend mailbox. Signed with the mailbox's webhook secret (Svix headers).
import { listMailboxes } from "@/lib/agent/store";
import { handleInbound } from "@/lib/agent/runner";
import { open } from "@/lib/mail/crypto";
import { fetchReceived, verifyResendWebhook } from "@/lib/mail/resend";
import type { Inbound } from "@/lib/mail/types";
import { getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Event = { type: string; created_at: string; data: { email_id?: string; from?: string; to?: string[]; subject?: string; message_id?: string } };

export async function POST(req: Request) {
  const wsId = new URL(req.url).searchParams.get("ws") ?? "";
  const ws = await getWorkspace(wsId);
  if (!ws) return new Response("unknown workspace", { status: 404 });
  const payload = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? "";
  const sig = req.headers.get("svix-signature") ?? "";
  const boxes = (await listMailboxes(ws.id)).filter((b) => b.provider === "resend" && b.webhookSecretSealed);
  const box = boxes.find((b) => verifyResendWebhook(open(b.webhookSecretSealed!), id, ts, sig, payload));
  if (!box) return new Response("bad signature", { status: 401 });

  const ev = JSON.parse(payload) as Event;
  const to = (ev.data.to?.[0] ?? "").toLowerCase();
  try {
    if (ev.type === "email.received" && ev.data.email_id) {
      await handleInbound(ws, box, await fetchReceived(box, ev.data.email_id));
    } else if (ev.type === "email.bounced" || ev.type === "email.complained") {
      // Delivery events are about OUR email: the "from" for matching is the recipient that bounced or complained.
      const m: Inbound = { uid: 0, messageId: `${ev.type}-${ev.data.email_id ?? id}`, inReplyTo: ev.data.message_id, references: ev.data.message_id ? [ev.data.message_id] : [], from: to, subject: ev.data.subject ?? "", date: ev.created_at, text: ev.type === "email.bounced" ? "Delivery failed (bounced)." : "Marked as spam by the recipient.", headers: {} };
      await handleInbound(ws, box, m, ev.type === "email.bounced" ? "bounce" : "unsubscribe");
    }
  } catch (e) {
    console.error("[resend webhook]", ev.type, e instanceof Error ? e.message : e);
    return new Response("error", { status: 500 }); // Resend retries
  }
  return Response.json({ ok: true });
}
