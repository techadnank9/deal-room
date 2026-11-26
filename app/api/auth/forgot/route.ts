import { APP_URL } from "@/lib/agent/runner";
import { sendSystemEmail } from "@/lib/mail/system";
import { createResetToken } from "@/lib/workspace";

export const runtime = "nodejs";

/** Always answers the same way, so it never reveals whether an account exists. */
export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (email?.includes("@")) {
    const token = await createResetToken(email);
    if (token) {
      const link = `${APP_URL}/reset?token=${token}`;
      await sendSystemEmail(
        email,
        "Reset your Deal Room password",
        `Someone asked to reset the password for your Deal Room account.\n\nSet a new password here (the link works for 1 hour):\n${link}\n\nIf this wasn't you, ignore this email; your password stays the same.`,
        `<p>Someone asked to reset the password for your Deal Room account.</p><p><a href="${link}">Set a new password</a> (the link works for 1 hour).</p><p style="color:#888">If this wasn't you, ignore this email; your password stays the same.</p>`,
      );
    }
  }
  return Response.json({ ok: true });
}
