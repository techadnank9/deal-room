import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { ImapFlow } from "imapflow";
import { open } from "./crypto";
import type { Mailbox, OutboundMessage, SendResult, VerifyResult } from "./types";
import { sendViaResend, verifyResend } from "./resend";

const TIMEOUT_MS = 20_000;

function transportFor(box: Mailbox) {
  const options: SMTPTransport.Options = {
    host: box.smtp.host,
    port: box.smtp.port,
    secure: box.smtp.secure,
    requireTLS: !box.smtp.secure, // never send credentials in clear on 587/25
    auth: { user: box.user, pass: open(box.passSealed) },
    pool: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  };
  return nodemailer.createTransport(options);
}

function addr(a: string | Mail.Address): string {
  return typeof a === "string" ? a : (a.address ?? "");
}

export async function sendMail(box: Mailbox, msg: OutboundMessage): Promise<SendResult> {
  if (box.provider === "resend") return sendViaResend(box, msg);
  const transporter = transportFor(box);
  try {
    // Always send as the authenticated mailbox (providers reject or rewrite other senders).
    const name = typeof msg.from === "object" && msg.from && "name" in msg.from ? msg.from.name : box.fromName;
    const info = await transporter.sendMail({ ...msg, from: { name: name || box.fromName, address: box.email } });
    return {
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map(addr),
      rejected: (info.rejected ?? []).map(addr),
    };
  } finally {
    transporter.close();
  }
}

function errText(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as Error & { code?: string; responseText?: string }).code;
    return code ? `${code}: ${e.message}` : e.message;
  }
  return String(e);
}

async function verifySmtp(box: Mailbox): Promise<string> {
  const transporter = transportFor(box);
  try {
    await transporter.verify();
    return "ok";
  } finally {
    transporter.close();
  }
}

async function verifyImap(box: Mailbox): Promise<string> {
  const client = new ImapFlow({
    host: box.imap.host,
    port: box.imap.port,
    secure: box.imap.secure,
    auth: { user: box.user, pass: open(box.passSealed) },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  await client.connect();
  await client.logout();
  return "ok";
}

/** Checks SMTP auth (transporter.verify) and an IMAP login+logout. Never throws. */
export async function verifyMailbox(box: Mailbox): Promise<VerifyResult> {
  if (box.provider === "resend") return verifyResend(box);
  const [s, i] = await Promise.allSettled([verifySmtp(box), verifyImap(box)]);
  const smtp = s.status === "fulfilled" ? s.value : errText(s.reason);
  const imap = i.status === "fulfilled" ? i.value : errText(i.reason);
  return { ok: smtp === "ok" && imap === "ok", smtp, imap };
}

/** Today's send cap: ramps linearly from 10 to dailyCap over 14 days from warmupStart. */
export function effectiveDailyCap(box: Mailbox, now: Date = new Date()): number {
  if (!box.warmupStart) return box.dailyCap;
  const start = Date.parse(box.warmupStart);
  if (Number.isNaN(start)) return box.dailyCap;
  const floor = Math.min(10, box.dailyCap);
  const days = Math.max(0, Math.floor((now.getTime() - start) / 86_400_000));
  if (days >= 14) return box.dailyCap;
  return Math.round(floor + ((box.dailyCap - floor) * days) / 14);
}
