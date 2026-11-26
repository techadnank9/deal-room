import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM sealing for mailbox secrets at rest.
// Sealed format: "v1." + base64url(iv[12] | tag[16] | ciphertext)

const VERSION = "v1";
const DEV_FALLBACK = "deal-room-dev-only-mail-secret-key-do-not-use-in-prod";

let cachedKey: Buffer | null = null;

function parseKey(raw: string): Buffer | null {
  const s = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  const b = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return b.length === 32 ? b : null;
}

/** 32-byte master key from MAIL_SECRET_KEY (hex or base64). Dev falls back to a derived constant. */
export function mailKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MAIL_SECRET_KEY;
  if (raw) {
    const k = parseKey(raw);
    if (!k) throw new Error("MAIL_SECRET_KEY must be 32 bytes, as 64 hex chars or base64");
    cachedKey = k;
    return k;
  }
  // No dedicated key: derive one from the database secret, which every server sharing this database already has.
  // (Rotating the database password would make stored mailbox passwords unreadable; users would reconnect mailboxes.)
  if (process.env.DATABASE_URL) {
    cachedKey = createHash("sha256").update("deal-room-mail-key-v1|").update(process.env.DATABASE_URL).digest();
    return cachedKey;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("MAIL_SECRET_KEY or DATABASE_URL is required in production");
  }
  console.warn("[mail] MAIL_SECRET_KEY not set; using an insecure dev-only key");
  cachedKey = createHash("sha256").update(DEV_FALLBACK).digest();
  return cachedKey;
}

/** Derive a purpose-specific subkey so encryption and HMAC never share a key. */
export function subKey(purpose: string): Buffer {
  return createHash("sha256").update(mailKey()).update(`|${purpose}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subKey("seal"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ct]).toString("base64url")}`;
}

export function open(sealed: string): string {
  const [ver, body] = sealed.split(".", 2);
  if (ver !== VERSION || !body) throw new Error("Unrecognised sealed secret format");
  const buf = Buffer.from(body, "base64url");
  if (buf.length < 28) throw new Error("Sealed secret too short");
  const decipher = createDecipheriv("aes-256-gcm", subKey("seal"), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
