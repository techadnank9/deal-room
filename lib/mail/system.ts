// Emails Deal Room itself sends (password resets), through Resend.
// Needs RESEND_API_KEY on the server. Sent from no-reply@notify.testerninja.com unless AUTH_EMAIL_FROM overrides it.
const FROM = () => process.env.AUTH_EMAIL_FROM || "Deal Room <no-reply@notify.testerninja.com>";
export function systemMailReady() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendSystemEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!systemMailReady()) {
    console.error("[system mail] RESEND_API_KEY not set; could not send:", subject);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], subject, text, html }),
    signal: AbortSignal.timeout(15000),
  }).catch((e) => {
    console.error("[system mail]", e instanceof Error ? e.message : e);
    return null;
  });
  if (!r?.ok) console.error("[system mail] Resend", r?.status, await r?.text().catch(() => ""));
  return Boolean(r?.ok);
}
