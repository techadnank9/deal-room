// Storage for the always-on agent: connected mailboxes, the send queue, replies, do-not-contact list.
import { randomUUID } from "node:crypto";
import { db, kvGet, kvSet } from "../db";
import { seal, type Endpoint, type Mailbox } from "../mail";

/* ---------- mailboxes ---------- */

export const MAILBOX_PRESETS: Record<string, { label: string; smtp: Endpoint; imap: Endpoint; help: string }> = {
  zoho_business: {
    label: "Zoho Mail (your company domain)",
    smtp: { host: "smtppro.zoho.com", port: 465, secure: true },
    imap: { host: "imappro.zoho.com", port: 993, secure: true },
    help: "Zoho Mail → Settings → Mail Accounts → IMAP: turn IMAP access on. Then accounts.zoho.com → Security → App Passwords: create one for Deal Room.",
  },
  zoho: {
    label: "Zoho Mail (@zohomail.com)",
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    help: "Turn IMAP on in Zoho Mail settings, then create an app password at accounts.zoho.com → Security.",
  },
  gmail: {
    label: "Google Workspace / Gmail",
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    help: "Needs 2-step verification on. Create an app password at myaccount.google.com/apppasswords.",
  },
  outlook: {
    label: "Microsoft 365 / Outlook",
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    help: "Your admin must allow SMTP AUTH for this mailbox. Use an app password if MFA is on.",
  },
  fastmail: {
    label: "Fastmail",
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    help: "Create an app password in Fastmail → Settings → Privacy & Security.",
  },
};

type MailboxRow = { id: string; workspace_id: string; data: string; last_uid: number | string; status: string };
export type StoredMailbox = Mailbox & { lastUid: number; status: string };

function toBox(r: MailboxRow): StoredMailbox {
  return { ...(JSON.parse(r.data) as Mailbox), id: r.id, workspaceId: r.workspace_id, lastUid: Number(r.last_uid) || 0, status: r.status };
}

export async function addMailbox(workspaceId: string, input: { email: string; fromName: string; preset: string; user?: string; password: string; dailyCap?: number }): Promise<StoredMailbox> {
  const p = MAILBOX_PRESETS[input.preset];
  if (!p) throw new Error("Pick your email provider.");
  const box: Mailbox = {
    id: `mb_${randomUUID().slice(0, 12)}`,
    workspaceId,
    email: input.email.trim().toLowerCase(),
    fromName: input.fromName.trim() || input.email,
    smtp: p.smtp,
    imap: p.imap,
    user: (input.user || input.email).trim(),
    passSealed: seal(input.password),
    dailyCap: Math.max(5, Math.min(60, input.dailyCap ?? 30)),
    warmupStart: new Date().toISOString(),
  };
  await (await db()).exec(`insert into mailboxes (id, workspace_id, data, last_uid, status) values (?, ?, ?, 0, 'ok')`, [box.id, workspaceId, JSON.stringify(box)]);
  return { ...box, lastUid: 0, status: "ok" };
}

export async function listMailboxes(workspaceId: string): Promise<StoredMailbox[]> {
  const rows = await (await db()).all<MailboxRow>(`select id, workspace_id, data, last_uid, status from mailboxes where workspace_id = ? order by created_at`, [workspaceId]);
  return rows.map(toBox);
}
export async function allMailboxes(): Promise<StoredMailbox[]> {
  const rows = await (await db()).all<MailboxRow>(`select id, workspace_id, data, last_uid, status from mailboxes`);
  return rows.map(toBox);
}
export async function removeMailbox(workspaceId: string, id: string) {
  await (await db()).exec(`delete from mailboxes where id = ? and workspace_id = ?`, [id, workspaceId]);
}
export async function setMailboxCursor(id: string, lastUid: number, status = "ok") {
  await (await db()).exec(`update mailboxes set last_uid = ?, status = ? where id = ?`, [lastUid, status, id]);
}

/** Public view: never return the sealed password. */
export function publicBox(b: StoredMailbox) {
  return { id: b.id, email: b.email, fromName: b.fromName, dailyCap: b.dailyCap, warmupStart: b.warmupStart, status: b.status, smtpHost: b.smtp.host };
}

/* ---------- outbox ---------- */

export type OutRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  touch_id: string | null;
  mailbox_id: string | null;
  to_email: string;
  subject: string | null;
  body: string;
  in_reply_to: string | null;
  scheduled_at: string | Date;
  status: string;
  message_id: string | null;
  sent_at: string | Date | null;
  error: string | null;
};

export async function enqueue(row: { workspaceId: string; leadId: string; touchId: string; mailboxId: string; to: string; subject: string; body: string; inReplyTo?: string; at: Date }) {
  const d = await db();
  const dup = await d.all<{ id: string }>(`select id from outbox where workspace_id = ? and touch_id = ? and status in ('queued','sent')`, [row.workspaceId, row.touchId]);
  if (dup.length) return dup[0].id;
  const id = `ob_${randomUUID().slice(0, 12)}`;
  await d.exec(
    `insert into outbox (id, workspace_id, lead_id, touch_id, mailbox_id, to_email, subject, body, in_reply_to, scheduled_at, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
    [id, row.workspaceId, row.leadId, row.touchId, row.mailboxId, row.to.toLowerCase(), row.subject, row.body, row.inReplyTo ?? null, row.at.toISOString()],
  );
  return id;
}

export async function dueOutbox(limit = 20): Promise<OutRow[]> {
  return (await db()).all<OutRow>(`select * from outbox where status = 'queued' and scheduled_at <= ? order by scheduled_at limit ?`, [new Date().toISOString(), limit]);
}
export async function markOut(id: string, patch: { status: string; messageId?: string; error?: string }) {
  await (await db()).exec(`update outbox set status = ?, message_id = coalesce(?, message_id), error = ?, sent_at = case when ? = 'sent' then ? else sent_at end where id = ?`, [
    patch.status,
    patch.messageId ?? null,
    patch.error ?? null,
    patch.status,
    new Date().toISOString(),
    id,
  ]);
}
export async function cancelLeadOutbox(workspaceId: string, leadId: string) {
  await (await db()).exec(`update outbox set status = 'cancelled' where workspace_id = ? and lead_id = ? and status = 'queued'`, [workspaceId, leadId]);
}
export async function sentTodayFrom(mailboxId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const rows = await (await db()).all<{ n: number | string }>(`select count(*) as n from outbox where mailbox_id = ? and status = 'sent' and sent_at >= ?`, [mailboxId, since.toISOString()]);
  return Number(rows[0]?.n ?? 0);
}
export async function sentMessages(workspaceId: string): Promise<{ id: string; lead_id: string | null; message_id: string | null; to_email: string; subject: string | null; touch_id: string | null }[]> {
  return (await db()).all(`select id, lead_id, message_id, to_email, subject, touch_id from outbox where workspace_id = ? and status = 'sent' and message_id is not null`, [workspaceId]);
}
export async function listOutbox(workspaceId: string, limit = 100): Promise<OutRow[]> {
  return (await db()).all<OutRow>(`select * from outbox where workspace_id = ? order by scheduled_at desc limit ?`, [workspaceId, limit]);
}

/* ---------- replies ---------- */

export type InboundRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  from_email: string | null;
  subject: string | null;
  text: string | null;
  clean: string | null;
  category: string | null;
  lead_id: string | null;
  draft: string | null;
  received_at: string | Date | null;
  handled: boolean | number;
};

export async function saveInbound(r: Omit<InboundRow, "id" | "handled">) {
  const d = await db();
  if (r.message_id) {
    const dup = await d.all<{ id: string }>(`select id from inbound where workspace_id = ? and message_id = ?`, [r.workspace_id, r.message_id]);
    if (dup.length) return dup[0].id;
  }
  const id = `in_${randomUUID().slice(0, 12)}`;
  await d.exec(
    `insert into inbound (id, workspace_id, mailbox_id, message_id, in_reply_to, from_email, subject, text, clean, category, lead_id, draft, received_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, r.workspace_id, r.mailbox_id, r.message_id, r.in_reply_to, r.from_email, r.subject, r.text, r.clean, r.category, r.lead_id, r.draft, r.received_at ? new Date(r.received_at).toISOString() : new Date().toISOString()],
  );
  return id;
}
export async function listInbound(workspaceId: string, limit = 100): Promise<InboundRow[]> {
  return (await db()).all<InboundRow>(`select * from inbound where workspace_id = ? order by received_at desc limit ?`, [workspaceId, limit]);
}
export async function getInbound(workspaceId: string, id: string): Promise<InboundRow | null> {
  const rows = await (await db()).all<InboundRow>(`select * from inbound where workspace_id = ? and id = ?`, [workspaceId, id]);
  return rows[0] ?? null;
}
export async function markHandled(workspaceId: string, id: string) {
  await (await db()).exec(`update inbound set handled = ? where workspace_id = ? and id = ?`, [(await db()).kind === "pg" ? true : 1, workspaceId, id]);
}

/* ---------- do-not-contact ---------- */

export async function suppress(workspaceId: string, email: string, reason: string) {
  const d = await db();
  if (d.kind === "pg") await d.exec(`insert into suppression (workspace_id, email, reason) values (?, ?, ?) on conflict (workspace_id, email) do nothing`, [workspaceId, email.toLowerCase(), reason]);
  else await d.exec(`insert or ignore into suppression (workspace_id, email, reason) values (?, ?, ?)`, [workspaceId, email.toLowerCase(), reason]);
}
export async function isSuppressed(workspaceId: string, email: string) {
  const domain = email.split("@")[1] ?? "";
  const rows = await (await db()).all<{ email: string }>(`select email from suppression where workspace_id = ? and (email = ? or email = ?)`, [workspaceId, email.toLowerCase(), `@${domain}`]);
  return rows.length > 0;
}

export async function unsuppress(workspaceId: string, email: string) {
  await (await db()).exec(`delete from suppression where workspace_id = ? and email = ?`, [workspaceId, email.toLowerCase()]);
}
export async function listSuppression(workspaceId: string): Promise<{ email: string; reason: string | null }[]> {
  return (await db()).all(`select email, reason from suppression where workspace_id = ? order by at desc limit 500`, [workspaceId]);
}

/* ---------- bounce brake ---------- */

export async function bounceStats(mailboxId: string, days = 14): Promise<{ sent: number; bounced: number }> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const d = await db();
  const s = await d.all<{ n: number | string }>(`select count(*) as n from outbox where mailbox_id = ? and status = 'sent' and sent_at >= ?`, [mailboxId, since]);
  const b = await d.all<{ n: number | string }>(`select count(*) as n from inbound where mailbox_id = ? and category = 'bounce' and received_at >= ?`, [mailboxId, since]);
  return { sent: Number(s[0]?.n ?? 0), bounced: Number(b[0]?.n ?? 0) };
}
export async function mailboxPause(mailboxId: string): Promise<{ reason: string; at: string } | null> {
  const p = await kvGet<{ reason: string; at: string }>(`mailbox-pause:${mailboxId}`);
  return p?.reason ? p : null;
}
export async function pauseMailbox(mailboxId: string, reason: string) {
  await kvSet(`mailbox-pause:${mailboxId}`, { reason, at: new Date().toISOString() });
}
export async function resumeMailbox(mailboxId: string) {
  await kvSet(`mailbox-pause:${mailboxId}`, null);
}
