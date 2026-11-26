import { readUnsubToken } from "@/lib/mail";
import { suppress } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = readUnsubToken(token);
  if (t) await suppress(t.workspaceId, t.email, "unsubscribe");
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">{t ? "You're unsubscribed" : "This link isn't valid"}</h1>
        <p className="mt-2 text-sm text-muted">{t ? `${t.email} won't get any more emails from this sender.` : "It may have been copied incompletely."}</p>
      </div>
    </main>
  );
}
