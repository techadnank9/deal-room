import type Mail from "nodemailer/lib/mailer";

export type Endpoint = { host: string; port: number; secure: boolean };

export type Mailbox = {
  id: string;
  workspaceId: string;
  email: string;
  fromName: string;
  smtp: Endpoint;
  imap: Endpoint;
  user: string;
  passSealed: string;
  dailyCap: number;
  /** ISO date; cap ramps from 10 to dailyCap over 14 days */
  warmupStart?: string;
  /** "smtp" (default: SMTP + IMAP with an app password) or "resend" (API key; replies arrive by webhook). */
  provider?: "smtp" | "resend";
  /** Where replies go (Resend). Defaults to the sending address. */
  replyTo?: string;
  /** Resend webhook signing secret, sealed. */
  webhookSecretSealed?: string;
  /** Plain-text signature added under every email (no links: write the domain as text). */
  signature?: string;
};

export type Inbound = {
  uid: number;
  messageId: string;
  inReplyTo?: string;
  references: string[];
  /** sender address, lowercased */
  from: string;
  fromName?: string;
  subject: string;
  date: string;
  /** raw plain text body (quoted history included; see cleanReply) */
  text: string;
  /** header values keyed by lowercased header name; repeated headers joined with "\n" */
  headers: Record<string, string>;
};

export type OutboundMessage = Mail.Options;

export type SendResult = { messageId: string; accepted: string[]; rejected: string[] };
export type VerifyResult = { ok: boolean; smtp: string; imap: string };
export type FetchResult = { lastUid: number; uidValidity: string; messages: Inbound[] };

/**
 * Pluggable mailbox transport. v1 is SMTP+IMAP with an app password;
 * a Gmail API / OAuth transport can implement the same interface later.
 */
export interface MailTransport {
  kind: string;
  send(box: Mailbox, msg: OutboundMessage): Promise<SendResult>;
  fetchNew(box: Mailbox, sinceUid?: number): Promise<FetchResult>;
  verify(box: Mailbox): Promise<VerifyResult>;
}

export type PresetName = "gmail" | "outlook" | "zoho" | "fastmail";

export const PRESETS: Record<PresetName, { smtp: Endpoint; imap: Endpoint }> = {
  gmail: {
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    imap: { host: "imap.gmail.com", port: 993, secure: true },
  },
  outlook: {
    // Microsoft 365 submits on 587 with STARTTLS (secure: false upgrades after connect)
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    imap: { host: "outlook.office365.com", port: 993, secure: true },
  },
  zoho: {
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
    imap: { host: "imap.zoho.com", port: 993, secure: true },
  },
  fastmail: {
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
  },
};
