import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { subKey } from "./crypto";
import type { OutboundMessage } from "./types";

export type BuildMessageInput = {
  from: { name: string; email: string };
  to: string;
  subject: string;
  text: string;
  /** Message-ID of the message being replied to (follow-ups) */
  inReplyTo?: string;
  /** Prior thread Message-IDs, oldest first */
  references?: string | string[];
  unsubscribeUrl: string;
  /** Sender's physical postal address (required by CAN-SPAM for commercial email). */
  address?: string;
  /** Plain-text signature under the message. */
  signature?: string;
  messageId?: string;
};

/** Wrap a Message-ID in angle brackets if missing. */
export function normalizeMessageId(id: string): string {
  const s = id.trim();
  if (!s) return s;
  return s.startsWith("<") ? s : `<${s.replace(/>$/, "")}>`;
}

function splitIds(v?: string | string[]): string[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.flatMap((x) => x.split(/[\s,]+/)).filter(Boolean).map(normalizeMessageId);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "localhost";
}

export function buildMessage(input: BuildMessageInput): OutboundMessage {
  const { from, to, subject, unsubscribeUrl } = input;
  const addr = input.address?.trim().replace(/\s*\n\s*/g, ", ");
  const footer = `If this isn't relevant, reply 'no' or unsubscribe: ${unsubscribeUrl}${addr ? `\n${addr}` : ""}`;
  const body = (input.signature?.trim() ? `${input.text.trimEnd()}\n\n${input.signature.trim()}` : input.text).replace(/\r\n/g, "\n").trimEnd();
  const text = `${body}\n\n--\n${footer}\n`;

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const safeUrl = escapeHtml(unsubscribeUrl);
  const html =
    `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">\n` +
    `${paragraphs}\n` +
    `<p style="margin:24px 0 0;font-size:12px;color:#888">If this isn't relevant, reply 'no' or ` +
    `<a href="${safeUrl}" style="color:#888">unsubscribe</a>.${addr ? `<br>${escapeHtml(addr)}` : ""}</p>\n</body></html>`;

  const messageId = normalizeMessageId(input.messageId ?? `${randomUUID()}@${domainOf(from.email)}`);
  const inReplyTo = input.inReplyTo ? normalizeMessageId(input.inReplyTo) : undefined;
  const references = splitIds(input.references);
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);

  const mailto = `mailto:${from.email}?subject=unsubscribe`;
  const opts: OutboundMessage = {
    from: { name: from.name, address: from.email },
    to,
    subject,
    text,
    html,
    messageId,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>, <${mailto}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  if (inReplyTo) opts.inReplyTo = inReplyTo;
  if (references.length) opts.references = references;
  return opts;
}

// ---- unsubscribe tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256) ----

function sign(payload: string): Buffer {
  return createHmac("sha256", subKey("unsub")).update(payload).digest();
}

export function makeUnsubToken(workspaceId: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ w: workspaceId, e: email.trim().toLowerCase() })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readUnsubToken(token: string): { workspaceId: string; email: string } | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, "base64url");
  const expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { w?: unknown; e?: unknown };
    if (typeof data.w !== "string" || typeof data.e !== "string") return null;
    return { workspaceId: data.w, email: data.e };
  } catch {
    return null;
  }
}
