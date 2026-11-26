import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { open } from "./crypto";
import type { FetchResult, Inbound, Mailbox } from "./types";

const TIMEOUT_MS = 20_000;
const MAX_PER_CALL = 50;
const FIRST_RUN_DAYS = 2;

function headerMap(parsed: ParsedMail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, line } of parsed.headerLines ?? []) {
    const k = key.toLowerCase();
    const idx = line.indexOf(":");
    const value = (idx >= 0 ? line.slice(idx + 1) : line).replace(/\r?\n[ \t]+/g, " ").trim();
    out[k] = k in out ? `${out[k]}\n${value}` : value;
  }
  return out;
}

function idList(v?: string | string[]): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(/\s+/)).filter(Boolean);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toInbound(uid: number, parsed: ParsedMail, internalDate?: Date | string): Inbound {
  const sender = parsed.from?.value?.[0];
  const date = parsed.date ?? (internalDate ? new Date(internalDate) : new Date());
  return {
    uid,
    messageId: parsed.messageId ?? "",
    inReplyTo: parsed.inReplyTo || undefined,
    references: idList(parsed.references),
    from: (sender?.address ?? "").toLowerCase(),
    fromName: sender?.name || undefined,
    subject: parsed.subject ?? "",
    date: date.toISOString(),
    text: parsed.text ?? (typeof parsed.html === "string" ? htmlToText(parsed.html) : ""),
    headers: headerMap(parsed),
  };
}

/**
 * Fetch INBOX messages with UID > sinceUid (oldest first, max 50 per call; call again
 * with the returned lastUid to continue). First run (no sinceUid) returns the newest
 * messages from the last 2 days. Persist uidValidity too: if it changes, UIDs were
 * reassigned and the cursor must be reset.
 */
export async function fetchNewMessages(box: Mailbox, sinceUid?: number): Promise<FetchResult> {
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

  try {
    await client.connect();
    // readOnly = EXAMINE, so fetching never flips \Seen on the customer's mail
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const mailbox = client.mailbox;
      const uidValidity = mailbox ? String(mailbox.uidValidity) : "";
      const uidNext = mailbox ? mailbox.uidNext : 1;

      let uids: number[];
      if (sinceUid !== undefined && sinceUid > 0) {
        const found = (await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true })) || [];
        // "N:*" always matches the highest UID even if it is < N, so filter
        uids = found.filter((u) => u > sinceUid).sort((a, b) => a - b).slice(0, MAX_PER_CALL);
      } else {
        const since = new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000);
        const found = (await client.search({ since }, { uid: true })) || [];
        uids = found.sort((a, b) => a - b).slice(-MAX_PER_CALL);
      }

      if (uids.length === 0) {
        const lastUid = sinceUid !== undefined && sinceUid > 0 ? sinceUid : Math.max(0, uidNext - 1);
        return { lastUid, uidValidity, messages: [] };
      }

      const fetched = await client.fetchAll(
        uids.join(","),
        { uid: true, source: true, internalDate: true },
        { uid: true },
      );
      const messages: Inbound[] = [];
      for (const m of fetched) {
        if (!m.source) continue;
        const parsed = await simpleParser(m.source, { skipImageLinks: true, skipTextToHtml: true });
        messages.push(toInbound(m.uid, parsed, m.internalDate));
      }
      messages.sort((a, b) => a.uid - b.uid);
      return { lastUid: Math.max(...uids), uidValidity, messages };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
