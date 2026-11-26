export { seal, open } from "./crypto";
export { PRESETS } from "./types";
export type {
  Endpoint,
  Mailbox,
  Inbound,
  OutboundMessage,
  SendResult,
  VerifyResult,
  FetchResult,
  MailTransport,
  PresetName,
} from "./types";
export { buildMessage, makeUnsubToken, readUnsubToken, normalizeMessageId } from "./compose";
export type { BuildMessageInput } from "./compose";
export { sendMail, verifyMailbox, effectiveDailyCap } from "./smtp";
export { fetchNewMessages } from "./imap";
export { cleanReply, isAutoReply, isBounce, matchThread } from "./replies";

import type { MailTransport } from "./types";
import { sendMail, verifyMailbox } from "./smtp";
import { fetchNewMessages } from "./imap";

/** v1 transport: SMTP send + IMAP read with an app password. */
export const smtpImapTransport: MailTransport = {
  kind: "smtp-imap",
  send: sendMail,
  fetchNew: fetchNewMessages,
  verify: verifyMailbox,
};
